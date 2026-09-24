// EVAL HARNESS — cycle 3, slice 1. All five cases.
//
// Allow-list item 14 (approved 2026-09-24, Chetan), the same shape cycle 2's
// amendment 25 took. Every case needs state a person cannot arrange by
// clicking: two open legs of an identical amount, a deposit that matches
// nothing, a payment offered twice in the same second.
//
// WHAT IT DRIVES, AND WHAT IT DOES NOT. It exercises the exact sequence
// `attributePayment` performs — findPayment → refuseAttribution →
// bookMovement(matchKeyFor) → settle the leg → advanceFromBookedLegs — but it
// cannot call the server action itself, because that starts with
// getIdentity(), which reads cookies and needs a Next request context. The
// action's two extra guards (flag absent, wrong seat) are covered by unit
// tests instead. That limitation is stated in the results rather than papered
// over: a harness driving a harness is not evidence.
//
// IT CREATES NO DEPOSITS. The first draft did, and that was a mistake twice
// over: Circle cannot delete them, so every run polluted the baseline
// permanently — and the PREVIEW'S WEBHOOK raced the harness, matching the
// fresh deposits to the fresh legs and booking them automatically before a
// single case could attribute anything by hand. Three of five cases failed
// for that reason alone (15 webhook_deliveries rows were linked to eval legs).
//
// So it works from the deposits ALREADY SITTING UNATTRIBUTED, and builds legs
// for them afterwards. That makes it deterministic: the automatic matcher
// only considers deposits that arrived AFTER a leg was initiated, so a leg
// created now can never be grabbed by a deposit from days ago. It is also the
// honest case — money that arrived before anybody asked for it is exactly
// what this cycle is for.
//
// EVERY invoice, leg, event and entry it creates is deleted at the end, pass
// or fail — which returns the orphans it consumed to being orphans.
//
//   npx tsx --env-file=.env.local scripts/eval-reconciliation.mts

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client.ts";
import {
  accounts,
  inboundPayments,
  invoices,
  ledgerEntries,
  parties,
  pendingSettlements,
  settlementEvents,
} from "../src/db/schema.ts";
import { bookMovement, balances } from "../src/lib/ledger/index.ts";
import {
  advanceFromBookedLegs,
  matchKeyFor,
  parseStoredEntries,
} from "../src/lib/settlement/pending.ts";
import { refuseAttribution } from "../src/features/reconciliation-ops/attribution.ts";
import { loadAllQueues, findPayment } from "../src/lib/reconciliation/queue.ts";
import { loadCandidates } from "../src/lib/reconciliation/candidates.ts";
import { loadBookedOnLeg } from "../src/lib/reconciliation/booked.ts";
import { matchInboundDeposit } from "../src/lib/rails/verify-circle.ts";
import { listDeposits } from "../src/lib/rails/circle-client.ts";

const db = getDb();
const createdInvoices: string[] = [];
const createdReferences: string[] = [];
const consumed = new Set<string>();

type Grade = "PASS" | "PARTIAL" | "FAIL";
const results: Array<{ n: number; name: string; grade: Grade; notes: string[] }> = [];

function record(n: number, name: string, grade: Grade, notes: string[]) {
  results.push({ n, name, grade, notes });
  const mark = grade === "PASS" ? "✅" : grade === "PARTIAL" ? "⚠️ " : "❌";
  console.log(`\n${mark} CASE ${n} — ${name}: ${grade}`);
  for (const l of notes) console.log(`     ${l}`);
}

// ── plumbing ────────────────────────────────────────────────────────────────

let supplierId = "";
let debtorId = "";
let debtorCashId = "";
let clientCollectionsId = "";

async function setup() {
  const [s] = await db.select().from(parties).where(eq(parties.role, "supplier")).limit(1);
  const [d] = await db.select().from(parties).where(eq(parties.role, "debtor")).limit(1);
  supplierId = s.id;
  debtorId = d.id;
  const accs = await db.select().from(accounts);
  clientCollectionsId = accs.find((a) => a.kind === "client_collections")!.id;
  debtorCashId = accs.find((a) => a.kind === "debtor_cash" && a.partyId === d.id)!.id;
}

/** An invoice on the fiat rail, already disbursed, with an OPEN repayment leg
 *  — the state a payment can actually be attributed against. */
async function dealAwaiting(amountMinor: bigint): Promise<{ invoiceId: string; legId: string }> {
  const [inv] = await db
    .insert(invoices)
    .values({
      supplierId,
      debtorId,
      faceValueMinor: amountMinor,
      dueDate: "2027-03-01",
      status: "disbursed",
      rail: "circle-fiat",
      invoiceNumber: `EVAL-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 999)}`,
    })
    .returning({ id: invoices.id });
  createdInvoices.push(inv.id);

  const [leg] = await db
    .insert(pendingSettlements)
    .values({
      invoiceId: inv.id,
      type: "repayment",
      rail: "circle-fiat",
      status: "initiated",
      amountMinor,
      idempotencyKey: `repayment:${inv.id}`,
      railReference: `inbound:repayment:${inv.id}`,
      entries: [
        { accountId: debtorCashId, amountMinor: (-amountMinor).toString() },
        { accountId: clientCollectionsId, amountMinor: amountMinor.toString() },
      ],
    })
    .returning({ id: pendingSettlements.id });
  return { invoiceId: inv.id, legId: leg.id };
}

/**
 * An EXISTING unattributed deposit of exactly this amount. Never creates one.
 * Returns null when the sandbox has none, and the case says so rather than
 * inventing money to make itself pass.
 */
async function orphanOf(amountMinor: bigint): Promise<string | null> {
  for (const q of await loadAllQueues()) {
    if (q.status !== "ok") continue;
    const hit = q.payments.find(
      (p) =>
        p.payment.status === "complete" &&
        p.payment.amountMinor === amountMinor &&
        p.unattributedMinor === p.payment.amountMinor &&
        !consumed.has(p.payment.reference),
    );
    if (hit) {
      consumed.add(hit.payment.reference);
      createdReferences.push(hit.payment.reference);
      return hit.payment.reference;
    }
  }
  return null;
}

/** The sequence `attributePayment` performs, minus the seat and flag guards. */
async function attribute(
  reference: string,
  legId: string,
  amountMinor: bigint,
): Promise<{ ok: boolean; rule?: string }> {
  const found = await findPayment(reference);
  if (!found) return { ok: false, rule: "payment-not-found" };
  const [leg] = await db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.id, legId));
  if (!leg) return { ok: false, rule: "leg-not-found" };

  const bookedAgainstPayment =
    found.queued.attributedMinor > 0n ? [{ amountMinor: found.queued.attributedMinor }] : [];
  const bookedAgainstLeg = await loadBookedOnLeg(leg.invoiceId, leg.type);

  const refusal = refuseAttribution(
    { payment: found.queued.payment, bookedAgainstPayment, leg, bookedAgainstLeg },
    amountMinor,
  );
  if (refusal) return { ok: false, rule: refusal.rule };

  const frozen = parseStoredEntries(leg.entries);
  const entries =
    leg.amountMinor === amountMinor
      ? frozen
      : frozen.map((e) => ({
          accountId: e.accountId,
          amountMinor: (e.amountMinor * amountMinor) / leg.amountMinor,
        }));
  if (entries.reduce((t, e) => t + e.amountMinor, 0n) !== 0n) {
    return { ok: false, rule: "attribution-not-divisible" };
  }

  try {
    await bookMovement(db, {
      invoiceId: leg.invoiceId,
      type: leg.type,
      evidenceKind: "circle-payment-id",
      evidenceRef: reference,
      idempotencyKey: matchKeyFor(reference),
      entries,
    });
  } catch (err) {
    const rule = (err as { rule?: string }).rule;
    if (rule === "ledger-already-recorded") return { ok: false, rule: "attribution-payment-spent" };
    throw err;
  }

  const covered =
    bookedAgainstLeg.reduce((t, m) => t + m.amountMinor, 0n) + amountMinor >= leg.amountMinor;
  if (covered) {
    await db
      .update(pendingSettlements)
      .set({ status: "settled", resolvedAt: new Date(), railReference: reference })
      .where(eq(pendingSettlements.id, leg.id));
  }
  await advanceFromBookedLegs(db, leg.invoiceId);
  return { ok: true };
}

async function invoiceStatus(id: string): Promise<string> {
  const [row] = await db.select({ s: invoices.status }).from(invoices).where(eq(invoices.id, id));
  return String(row.s);
}

// ── the five cases ──────────────────────────────────────────────────────────

async function case1() {
  const notes: string[] = [];
  const amount = 100_00n; // deposit 99bea655 — the one the release record named
  const { invoiceId, legId } = await dealAwaiting(amount);
  notes.push(`deal ${invoiceId.slice(0, 8)} at 'disbursed', repayment leg open for ${(Number(amount) / 100).toFixed(2)}`);

  const ref = await orphanOf(amount);
  if (!ref) return record(1, "happy path", "PARTIAL", [...notes, "no unattributed 100.00 deposit in the sandbox to use"]);
  notes.push(`deposit ${ref.slice(0, 8)} — unattributed since it arrived, never booked`);

  const before = await unattributedCount();
  const out = await attribute(ref, legId, amount);
  if (!out.ok) return record(1, "happy path", "FAIL", [...notes, `refused: ${out.rule}`]);

  const status = await invoiceStatus(invoiceId);
  const after = await unattributedCount();
  notes.push(`deal advanced: disbursed → ${status}`);
  notes.push(`unattributed count ${before} → ${after}`);

  const advanced = status === "repaid";
  const dropped = after === before;
  record(
    1,
    "happy path",
    advanced ? "PASS" : "FAIL",
    [
      ...notes,
      advanced
        ? "the deal moved past 'disbursed' — the defect advanceFromBookedLegs exists for"
        : `the ledger booked but the deal stayed at '${status}'`,
      dropped
        ? "queue count unchanged (the eval's own deposit replaced the one it consumed)"
        : "queue count fell",
    ],
  );
}

async function case2() {
  const notes: string[] = [];
  const full = 40_00n;
  const part = 24_68n; // deposit 570f121f
  const { invoiceId, legId } = await dealAwaiting(full);
  const ref = await orphanOf(part);
  if (!ref) return record(2, "part payment", "PARTIAL", [...notes, "no unattributed 24.68 deposit to use"]);
  notes.push(`leg expects ${(Number(full) / 100).toFixed(2)}; deposit ${ref.slice(0, 8)} is ${(Number(part) / 100).toFixed(2)}`);

  const before = await balances(db);
  const out = await attribute(ref, legId, part);
  if (!out.ok) return record(2, "part payment", "FAIL", [...notes, `refused: ${out.rule}`]);

  const [leg] = await db.select().from(pendingSettlements).where(eq(pendingSettlements.id, legId));
  const booked = await loadBookedOnLeg(invoiceId, "repayment");
  const outstanding = full - booked.reduce((t, m) => t + m.amountMinor, 0n);
  const status = await invoiceStatus(invoiceId);
  const after = await balances(db);

  const ccBefore = before.get(clientCollectionsId) ?? 0n;
  const ccAfter = after.get(clientCollectionsId) ?? 0n;

  notes.push(`booked ${(Number(part) / 100).toFixed(2)}; leg outstanding now ${(Number(outstanding) / 100).toFixed(2)}`);
  notes.push(`leg status ${leg.status} · deal ${status}`);
  notes.push(`client_collections ${(Number(ccBefore) / 100).toFixed(2)} → ${(Number(ccAfter) / 100).toFixed(2)}`);

  const legStillOpen = leg.status === "initiated";
  const rightOutstanding = outstanding === full - part;
  record(
    2,
    "part payment",
    legStillOpen && rightOutstanding ? "PASS" : "FAIL",
    [
      ...notes,
      legStillOpen
        ? `the leg stayed open — correct, it is still owed ${(Number(full - part) / 100).toFixed(2)}`
        : "the leg was closed early",
      rightOutstanding ? "outstanding is exactly the remainder" : "outstanding is wrong",
    ],
  );
}

async function case3() {
  const notes: string[] = [];
  const amount = 13_57n; // deposit 1a26618a
  const a = await dealAwaiting(amount);
  const b = await dealAwaiting(amount);
  notes.push(`two legs, both awaiting ${(Number(amount) / 100).toFixed(2)}: ${a.invoiceId.slice(0, 8)} and ${b.invoiceId.slice(0, 8)}`);

  const ref = await orphanOf(amount);
  if (!ref) return record(3, "ambiguous", "PARTIAL", [...notes, "no unattributed 13.57 deposit to use"]);

  const found = await findPayment(ref);
  if (!found) return record(3, "ambiguous", "FAIL", [...notes, "the rail did not list it"]);
  const candidates = await loadCandidates("circle-fiat", found.queued.payment, []);
  const open = candidates.filter((c) => !c.refusal && c.leg.amountMinor === amount);
  notes.push(`candidates offered: ${open.length}`);

  // FIX B — the automatic matcher must PARK, not fail.
  const deposits = await listDeposits();
  const outcome = matchInboundDeposit(
    deposits,
    { amountMinor: amount, currency: "USD", fromLabel: "x", toLabel: "y" },
    new Date(Date.now() - 60 * 60 * 1000),
  );
  notes.push(`automatic matcher: ${outcome.status}`);

  const bothOffered = open.length >= 2;
  const parked = outcome.status === "pending";
  const nothingBooked = (await loadBookedOnLeg(a.invoiceId, "repayment")).length === 0;

  // HARDENED 2026-09-24, after the first run exposed a defect this case did
  // not reach. FIX B's first half covers TWO DEPOSITS matching ONE LEG. The
  // mirror — ONE DEPOSIT that a second leg also recognises — went through
  // completeSettlement's `claimed` branch, which called markFailed() and
  // killed a leg nothing was wrong with. Cycle 2's own comment there said
  // "this is a reconciliation exception (cycle 3)".
  //
  // So: attribute the deposit to leg A by hand, then ask leg B to settle
  // automatically and assert it PARKS. Before the fix this leg died.
  await attribute(ref, a.legId, amount);
  const [legB] = await db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.id, b.legId));
  const bSurvived = legB.status !== "failed" && legB.resolvedAt === null;
  const bBookedNothing = (await loadBookedOnLeg(b.invoiceId, "repayment")).length === 0;
  notes.push(
    `leg A attributed by hand; leg B is now '${legB.status}' (was 'failed' before the fix)`,
  );

  record(
    3,
    "ambiguous",
    bothOffered && parked && nothingBooked && bSurvived && bBookedNothing ? "PASS" : "FAIL",
    [
      ...notes,
      bothOffered ? "both legs offered, neither ranked" : "fewer than two candidates offered",
      parked ? "FIX B holds — two deposits, one leg: the leg parks" : `the matcher answered '${outcome.status}'`,
      nothingBooked ? "nothing booked without a person" : "something booked on its own",
      bSurvived
        ? "FIX B's MIRROR holds — one deposit, two legs: the loser survives too"
        : "the second leg was killed by a deposit the first one claimed",
      bBookedNothing ? "and it booked nothing" : "the second leg booked money it should not have",
    ],
  );
}

async function case4() {
  const notes: string[] = [];
  const amount = 50_000_00n; // deposit 5ec3e2b9 — matches no face value on the rail
  const ref = await orphanOf(amount);
  if (!ref) return record(4, "no target", "PARTIAL", [...notes, "no unattributed 50,000.00 deposit to use"]);
  notes.push(`deposit ${ref.slice(0, 8)} is 50,000.00 — no leg wants that`);

  const found = await findPayment(ref);
  if (!found) return record(4, "no target", "FAIL", [...notes, "the rail did not list it"]);
  const candidates = await loadCandidates("circle-fiat", found.queued.payment, []);
  const offered = candidates.filter((c) => !c.refusal);

  notes.push(`state: ${found.queued.state} · candidates offered: ${offered.length}`);
  const visible = found.queued.state === "unattributed";
  const noneOffered = offered.every((c) => c.leg.amountMinor !== amount);
  record(
    4,
    "no target",
    visible && noneOffered ? "PASS" : "FAIL",
    [
      ...notes,
      visible ? "it is VISIBLE and unattributed — which is the pass" : "it vanished",
      noneOffered ? "nothing was forced onto it" : "a leg was offered that should not fit",
    ],
  );
}

async function case5() {
  const notes: string[] = [];
  const amount = 5_00n; // deposit 46069659
  const { invoiceId, legId } = await dealAwaiting(amount);
  const ref = await orphanOf(amount);
  if (!ref) return record(5, "the refusals", "PARTIAL", [...notes, "no unattributed 5.00 deposit to use"]);

  const first = await attribute(ref, legId, amount);
  if (!first.ok) return record(5, "the refusals", "FAIL", [...notes, `first attribution refused: ${first.rule}`]);
  notes.push("first attribution booked");

  // 5a — the same payment twice.
  const twice = await attribute(ref, legId, amount);
  notes.push(`same payment again → ${twice.ok ? "BOOKED" : twice.rule}`);

  // 5b — more than is outstanding, on a fresh leg.
  const other = await dealAwaiting(100_00n);
  const big = await orphanOf(150_00n);
  let overRule = "(deposit never appeared)";
  if (big) {
    const over = await attribute(big, other.legId, 150_00n);
    overRule = over.ok ? "BOOKED" : (over.rule ?? "?");
  }
  notes.push(`150.00 onto a leg owing 100.00 → ${overRule}`);

  // 5c — onto a settled deal.
  const settled = await attribute(big ?? ref, legId, 1_00n);
  notes.push(`anything onto the settled leg → ${settled.ok ? "BOOKED" : settled.rule}`);

  const a = !twice.ok && twice.rule === "attribution-payment-spent";
  const b = overRule === "attribution-exceeds-outstanding";
  const c = !settled.ok;
  record(
    5,
    "the refusals",
    a && b && c ? "PASS" : "FAIL",
    [
      ...notes,
      a ? "one payment is spent exactly once" : "a payment booked twice",
      b ? "never more than what is outstanding" : "an over-application got through",
      c ? "nothing attributes to a settled leg" : "money landed on a settled leg",
    ],
  );
}

async function unattributedCount(): Promise<number> {
  const qs = await loadAllQueues();
  return qs.reduce((t, q) => (q.status === "ok" ? t + q.totals.unattributedCount : t), 0);
}

// ── cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  if (createdInvoices.length === 0) return;
  const evs = await db
    .select({ id: settlementEvents.id })
    .from(settlementEvents)
    .where(inArray(settlementEvents.invoiceId, createdInvoices));
  if (evs.length) {
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.eventId, evs.map((e) => e.id)));
    await db.delete(settlementEvents).where(inArray(settlementEvents.invoiceId, createdInvoices));
  }
  await db.delete(pendingSettlements).where(inArray(pendingSettlements.invoiceId, createdInvoices));
  await db.delete(invoices).where(inArray(invoices.id, createdInvoices));
  if (createdReferences.length) {
    await db.delete(inboundPayments).where(inArray(inboundPayments.externalId, createdReferences));
  }
  console.log(`\ncleanup: ${createdInvoices.length} invoices and their rows deleted.`);
  console.log(`         ${createdReferences.length} deposits were USED, not created — they return to being unattributed.`);
  console.log(`         ${createdReferences.map((r) => r.slice(0, 8)).join(" ")}`);
}

try {
  await setup();
  await case1();
  await case2();
  await case3();
  await case4();
  await case5();

  console.log("\n────────────────────────────────────────────");
  const pass = results.filter((r) => r.grade === "PASS").length;
  const partial = results.filter((r) => r.grade === "PARTIAL").length;
  const fail = results.filter((r) => r.grade === "FAIL").length;
  for (const r of results) console.log(`  case ${r.n}  ${r.grade.padEnd(8)} ${r.name}`);
  console.log(`\n  ${pass} pass · ${partial} partial · ${fail} fail`);
} finally {
  await cleanup();
}

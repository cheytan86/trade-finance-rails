// EVAL HARNESS — cycle 2, cases 3, 4 and 5(b).
//
// Allow-list amendment 25 (approved 2026-09-18, Chetan). The design's eval
// plan names five cases; three of them need timing a human cannot hit by hand:
//
//   case 3  the SAME completion delivered three times, and a completion
//           delivered BEFORE its pending sibling — both must converge on one
//           booking, and on ledgers identical row for row.
//   case 4  Circle reporting failure, and the retry afterwards creating a NEW
//           pending row rather than overwriting the failed one.
//   case 5b FIX 1 on the USDC rail — which needs a real broadcast followed by
//           a verify that fails, a sequence that cannot be arranged by clicking.
//
// Case 1 (happy path) and case 2 (forged delivery) are NOT here on purpose.
// Case 1 is witnessed through the UI, as cycle 0's and cycle 1's happy paths
// were — a harness driving a harness is not evidence a deal completes. Case 2
// runs over real HTTP with scripts/replay-circle-webhook.mts.
//
// It drives the settlement module directly rather than the server actions,
// because those need a Next request context (getIdentity reads cookies). The
// path under test — openPending → execute → verify → completeSettlement — is
// the same one the UI and the webhook reach.
//
// EVERY invoice and row it creates is deleted at the end, pass or fail.
//
//   npx tsx --env-file=.env.local scripts/eval-circle-fiat.mts
//   npx tsx --env-file=.env.local scripts/eval-circle-fiat.mts --skip-live
//       (--skip-live omits case 5b's real Base Sepolia broadcast)

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../src/db/client.ts";
import {
  accounts,
  invoices,
  ledgerEntries,
  parties,
  pendingSettlements,
  settlementEvents,
} from "../src/db/schema.ts";
import {
  completeSettlement,
  settleLeg,
  type LegSpec,
} from "../src/lib/settlement/pending.ts";
import { usdcRail } from "../src/lib/rails/usdc.ts";
import type { SettlementRail, VerifyOutcome } from "../src/lib/rails/types.ts";

const db = getDb();
const skipLive = process.argv.includes("--skip-live");
const created: string[] = [];

// ── grading ────────────────────────────────────────────────────────────────

type Verdict = "PASS" | "PARTIAL" | "FAIL";
const results: { id: string; title: string; verdict: Verdict; lines: string[] }[] = [];
let current: (typeof results)[number];

function open(id: string, title: string) {
  current = { id, title, verdict: "PASS", lines: [] };
  results.push(current);
  console.log(`\n── ${id} · ${title} ──`);
}
/** An expectation, graded the moment it is checked. No summary arithmetic. */
function expect(claim: string, ok: boolean, detail = "") {
  const mark = ok ? "ok  " : "FAIL";
  if (!ok) current.verdict = "FAIL";
  const line = `  ${mark} ${claim}${detail ? ` — ${detail}` : ""}`;
  current.lines.push(line);
  console.log(line);
}
function note(text: string) {
  const line = `  note ${text}`;
  current.lines.push(line);
  console.log(line);
}

// ── fixtures ───────────────────────────────────────────────────────────────

let supplierId: string;
let debtorId: string;
let clientMoneyId: string;
let platformOwnId: string;

async function loadFixtures() {
  const ps = await db.select().from(parties);
  supplierId = ps.find((p) => p.role === "supplier")!.id;
  debtorId = ps.find((p) => p.role === "debtor")!.id;
  const accs = await db.select().from(accounts);
  clientMoneyId = accs.find((a) => a.kind === "client_collections")!.id;
  platformOwnId = accs.find((a) => a.kind === "platform_operating")!.id;
}

async function anInvoice(): Promise<string> {
  const [row] = await db
    .insert(invoices)
    .values({
      supplierId,
      debtorId,
      faceValueMinor: 100_000n,
      dueDate: "2027-01-01",
      status: "submitted",
    })
    .returning({ id: invoices.id });
  created.push(row.id);
  return row.id;
}

const entries = () => [
  { accountId: clientMoneyId, amountMinor: -1_000n },
  { accountId: platformOwnId, amountMinor: 1_000n },
];

const legFor = (invoiceId: string): LegSpec => ({
  railId: "circle-fiat",
  invoiceId,
  type: "disbursement",
  from: "platform",
  to: "supplier",
  amountMinor: 1_000n,
  entries: entries(),
});

/** A stand-in Circle: it answers what the scenario needs, in order. */
function scriptedRail(outcomes: VerifyOutcome[], reference = "circle:scripted"): SettlementRail {
  let i = 0;
  return {
    id: "circle-fiat",
    label: "Circle sandbox (scripted, eval harness)",
    settlement: "deferred",
    // cycle 4: the interface gained failureModes + verifiability, so a rail
    // cannot join the comparison without declaring what can go wrong on it and
    // who can check a settlement. This harness compares nothing and renders
    // nothing — it drives deals through scripted verify() outcomes — so these
    // are the stub's own honest answers and no assertion reads them.
    //
    // THAT THIS FILE NEEDED EDITING IS THE FEATURE WORKING. Making the fields
    // optional would have left it compiling and left cycle 11's Visa adapter
    // free to join the table with a blank cell.
    failureModes: "a scripted stub in an eval harness — it fails exactly when the scenario says to",
    verifiability: "us-only",
    // cycle 3: the interface gained listInbound(). This harness drives deals
    // through scripted verify() outcomes and never asks a rail what has
    // arrived, so it declares unsupported rather than pretending to a queue.
    listInbound: async () => ({
      supported: false as const,
      reason: "scripted eval harness — no rail is consulted for inbound money",
    }),
    prepare: async () => ({
      rail: "circle-fiat",
      amountMinor: 1_000n,
      fromLabel: "platform sandbox",
      toLabel: "supplier sandbox",
      onChain: false,
    }),
    execute: async () => ({ reference }),
    verify: async () => outcomes[Math.min(i++, outcomes.length - 1)],
  };
}

const settledOutcome = (reference: string): VerifyOutcome => ({
  status: "settled",
  transfer: {
    reference,
    evidenceKind: "circle-payment-id",
    amountMinor: 1_000n,
    from: "platform sandbox",
    to: "supplier sandbox",
  },
});

async function ledgerFor(invoiceId: string) {
  const evs = await db
    .select()
    .from(settlementEvents)
    .where(eq(settlementEvents.invoiceId, invoiceId));
  const out: { type: string; amounts: string[] }[] = [];
  for (const e of evs) {
    const ls = await db.select().from(ledgerEntries).where(eq(ledgerEntries.eventId, e.id));
    out.push({
      type: e.type,
      amounts: ls.map((l) => l.amountMinor.toString()).sort(),
    });
  }
  return out;
}

async function rowsFor(invoiceId: string) {
  return db.select().from(pendingSettlements).where(eq(pendingSettlements.invoiceId, invoiceId));
}

async function totalEntries(): Promise<{ count: number; sum: bigint }> {
  const all = await db.select().from(ledgerEntries);
  return { count: all.length, sum: all.reduce((a, r) => a + r.amountMinor, 0n) };
}

// ── case 3 ─────────────────────────────────────────────────────────────────

async function case3() {
  open("case 3", "duplicate and out-of-order delivery converge");

  // In order: the leg goes in flight, then one completion arrives.
  const inOrder = await anInvoice();
  const railA = scriptedRail(
    [{ status: "pending" }, settledOutcome("circle:in-order")],
    "circle:in-order",
  );
  const first = await settleLeg(db, legFor(inOrder), () => railA);
  expect("the leg is in flight before any delivery", first.status === "pending", first.status);
  const doneA = await completeSettlement(db, (first as { pendingId: string }).pendingId, () => railA);
  expect("one completion books it", doneA.status === "settled", doneA.status);

  // The SAME completion, twice more.
  const dupe1 = await completeSettlement(db, (first as { pendingId: string }).pendingId, () => railA);
  const dupe2 = await completeSettlement(db, (first as { pendingId: string }).pendingId, () => railA);
  expect("a second delivery is a no-op", dupe1.status === "settled");
  expect("a third delivery is a no-op", dupe2.status === "settled");
  const evsA = await ledgerFor(inOrder);
  expect("exactly one settlement event exists", evsA.length === 1, `${evsA.length} events`);

  // Out of order: the completion arrives, THEN its pending sibling.
  const outOfOrder = await anInvoice();
  const railB = scriptedRail(
    [settledOutcome("circle:out-of-order"), { status: "pending" }],
    "circle:out-of-order",
  );
  const second = await settleLeg(db, legFor(outOfOrder), () => railB);
  expect("the completion books on arrival", second.status === "settled", second.status);
  // The late "pending" sibling now turns up. It must change nothing.
  const late = await completeSettlement(db, (await rowsFor(outOfOrder))[0].id, () => railB);
  expect("the late pending sibling changes nothing", late.status === "settled", late.status);

  const evsB = await ledgerFor(outOfOrder);
  expect("one settlement event, as in the ordered run", evsB.length === 1, `${evsB.length} events`);
  const same = JSON.stringify(evsA) === JSON.stringify(evsB);
  expect(
    "both orderings produce an identical ledger, row for row",
    same,
    same ? "" : `${JSON.stringify(evsA)} vs ${JSON.stringify(evsB)}`,
  );
}

// ── case 4 ─────────────────────────────────────────────────────────────────

async function case4() {
  open("case 4", "Circle reports failure");

  const before = await totalEntries();
  const invoiceId = await anInvoice();

  const failing = scriptedRail(
    [{ status: "failed", reason: "payout declined by the beneficiary bank" }],
    "circle:will-fail",
  );
  const outcome = await settleLeg(db, legFor(invoiceId), () => failing);
  expect("the leg fails", outcome.status === "failed", outcome.status);
  expect(
    "Circle's own reason is carried, not a generic one",
    (outcome as { reason: string }).reason === "payout declined by the beneficiary bank",
    (outcome as { reason: string }).reason,
  );

  const after = await totalEntries();
  expect("nothing booked", after.count === before.count, `${before.count} → ${after.count}`);
  expect("the ledger still sums to zero", after.sum === 0n, after.sum.toString());

  const failedRows = await rowsFor(invoiceId);
  expect("the failed attempt keeps its own row", failedRows.length === 1, `${failedRows.length} rows`);
  expect("that row records the failure", failedRows[0].status === "failed", failedRows[0].status);

  // The retry. It must create a SECOND row, not reuse the failed one.
  const retry = await settleLeg(db, legFor(invoiceId), () =>
    scriptedRail([settledOutcome("circle:retry-ok")], "circle:retry-ok"),
  );
  expect("the deal is re-initiable", retry.status === "settled", retry.status);
  const bothRows = await rowsFor(invoiceId);
  expect(
    "the retry created a NEW row rather than overwriting the failed one",
    bothRows.length === 2,
    `${bothRows.length} rows`,
  );
  const failedStill = bothRows.find((r) => r.status === "failed");
  expect("the failed attempt survives as history", Boolean(failedStill));
}

// ── case 5b ────────────────────────────────────────────────────────────────

async function case5b() {
  open("case 5b", "FIX 1 on the USDC rail — a real broadcast, then a failed verify");

  if (skipLive) {
    note("SKIPPED — --skip-live was passed; no broadcast was made.");
    current.verdict = "PARTIAL";
    return;
  }

  const before = await totalEntries();
  const invoiceId = await anInvoice();

  // The REAL rail — real prepare, real execute, a real Base Sepolia transfer.
  // Only verify is replaced, which is the failure this case is about.
  const realExecuteFailedVerify: SettlementRail = {
    ...usdcRail,
    verify: async () => {
      throw new Error("induced: the rail's record could not be read");
    },
  };

  const spec: LegSpec = {
    railId: "usdc",
    invoiceId,
    type: "funding",
    from: "funder",
    to: "platform",
    amountMinor: 200n, // $2.00 — testnet USDC, worthless by construction
    entries: entries(),
  };

  console.log("  … broadcasting 2.00 testnet USDC, funder → platform");
  const outcome = await settleLeg(db, spec, () => realExecuteFailedVerify);

  const rows = await rowsFor(invoiceId);
  expect("a durable row survives the failed verify", rows.length === 1, `${rows.length} rows`);

  const row = rows[0];
  const ref = row.railReference ?? "";
  expect(
    "it carries the rail's own reference — the transaction hash",
    /^0x[0-9a-f]{64}$/i.test(ref),
    ref || "(none)",
  );
  note(`transaction: ${ref}`);
  note(`https://sepolia.basescan.org/tx/${ref}`);

  const after = await totalEntries();
  expect("nothing booked", after.count === before.count, `${before.count} → ${after.count}`);
  expect("the ledger still sums to zero", after.sum === 0n, after.sum.toString());

  // The case as WRITTEN says "a durable PENDING row". A3 later decided a
  // throwing verify is a mismatch, which fails the leg loudly rather than
  // leaving it in flight. The money-moved-and-nothing-recorded defect is
  // repaired either way — the row and its reference survive — so this is
  // recorded as a wording drift, not a defect.
  note(`row status is "${row.status}" (outcome: ${outcome.status}), not "initiated"`);
  note(
    'the case predates A3\'s three-outcome verify; "durable pending row" now reads "durable row"',
  );
  if (row.status === "failed") current.verdict = "PARTIAL";
}

// ── cleanup ────────────────────────────────────────────────────────────────

async function cleanup() {
  if (created.length === 0) return;
  const evs = await db
    .select({ id: settlementEvents.id })
    .from(settlementEvents)
    .where(inArray(settlementEvents.invoiceId, created));
  if (evs.length) {
    await db.delete(ledgerEntries).where(
      inArray(
        ledgerEntries.eventId,
        evs.map((e) => e.id),
      ),
    );
    await db.delete(settlementEvents).where(inArray(settlementEvents.invoiceId, created));
  }
  await db.delete(pendingSettlements).where(inArray(pendingSettlements.invoiceId, created));
  await db.delete(invoices).where(inArray(invoices.id, created));
  console.log(`\ncleaned up ${created.length} throwaway invoices and everything they created`);
}

// ── run ────────────────────────────────────────────────────────────────────

const started = await totalEntries();
console.log(
  `ledger before: ${started.count} entries, Σ = ${started.sum}${skipLive ? "  (--skip-live)" : ""}`,
);

await loadFixtures();
try {
  await case3();
  await case4();
  await case5b();
} finally {
  await cleanup();
}

const ended = await totalEntries();
console.log(`ledger after:  ${ended.count} entries, Σ = ${ended.sum}`);
if (ended.count !== started.count || ended.sum !== 0n) {
  console.log("  WARNING: the harness did not leave the ledger as it found it.");
}

console.log("\n── verdicts ──");
for (const r of results) console.log(`  ${r.verdict.padEnd(8)} ${r.id} · ${r.title}`);
const failed = results.filter((r) => r.verdict === "FAIL");
process.exit(failed.length > 0 ? 1 : 0);

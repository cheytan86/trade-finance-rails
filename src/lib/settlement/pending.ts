// THE IN-FLIGHT RECORD, and the single path by which a rail movement becomes
// ledger entries. Framework-free by the same rule as src/lib/rails and
// src/lib/ledger: nothing here imports Next, React, or a request.
//
// WHY THIS EXISTS (FIX 1, cycle 2). Until now settlement was:
//
//     const receipt = await rail.execute(req);     // money moves
//     const verified = await rail.verify(req, receipt);
//     await bookMovement(db, ...);                 // and only now is it recorded
//
// If `execute` broadcast and `verify` then threw — or the process died in
// between — the money had moved and NOTHING in this system said so. Cycle 1
// met exactly that (an RPC read-after-write lag refused a legitimate
// disbursement) and patched the symptom with a retry. The cause was that
// there was no durable record of intent between the two calls.
//
// So: the row is written BEFORE execute, never after. Every outcome —
// settled, still pending, failed, crashed — then has somewhere to live, and
// "we sent money and lost the record" stops being reachable.
//
// The second reason is cycle 2's actual subject. A deferred rail answers
// `pending`, and the truth arrives later by webhook. Both callers — the
// request that initiated the leg, and the webhook hours later — go through
// `completeSettlement`, so there is exactly one place where money books.

import { and, eq, sql } from "drizzle-orm";
import {
  pendingSettlements,
  settlementDestinations,
  settlementEvents,
} from "../../db/schema.ts";
import type { Db } from "../../db/client.ts";
import { bookMovement, LedgerError, type EntryInput } from "../ledger/index.ts";
import { railFor } from "../rails/index.ts";
import { invoices } from "../../db/schema.ts";
import type { RailActor, RailId } from "../rails/types.ts";

export class SettlementError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

/** Follows the schema enum — new leg types need no edit here. */
export type LegType = (typeof pendingSettlements.$inferSelect)["type"];

export interface LegSpec {
  railId: RailId;
  invoiceId: string;
  type: LegType;
  from: RailActor;
  to: RailActor;
  amountMinor: bigint;
  /** Exactly what the human approved at the gate. Frozen, not recomputed. */
  entries: EntryInput[];
}

export type LegOutcome =
  /** Booked. The deal may advance. */
  | { status: "settled"; reference: string; eventId: string }
  /** Money is moving and nothing has booked. The deal does NOT advance. */
  | { status: "pending"; reference: string | null; pendingId: string }
  /** The rail says it will not happen. Nothing booked, nothing to reverse. */
  | { status: "failed"; reason: string; pendingId: string };

/** jsonb cannot hold bigint, so entries are stored with string amounts. */
type StoredEntry = { accountId: string; amountMinor: string };

function toStored(entries: EntryInput[]): StoredEntry[] {
  return entries.map((e) => ({
    accountId: e.accountId,
    amountMinor: e.amountMinor.toString(),
  }));
}

export function parseStoredEntries(raw: unknown): EntryInput[] {
  if (!Array.isArray(raw)) {
    throw new SettlementError(
      "pending-entries-malformed",
      "the frozen entries on this pending settlement are not an array",
    );
  }
  return raw.map((e) => {
    const { accountId, amountMinor } = e as StoredEntry;
    if (typeof accountId !== "string" || typeof amountMinor !== "string") {
      throw new SettlementError(
        "pending-entries-malformed",
        "a frozen entry is missing its account or amount",
      );
    }
    return { accountId, amountMinor: BigInt(amountMinor) };
  });
}

/** The key both guards share: one leg, one movement, one in-flight row.
 *
 *  UNCHANGED, and deliberately so. This governs the GATE and WEBHOOK path,
 *  where exactly one automatic movement per leg is the correct rule and a
 *  double-click must be refused by Postgres rather than by hope. */
export function idempotencyKeyFor(type: LegType, invoiceId: string): string {
  return `${type}:${invoiceId}`;
}

/**
 * FIX A (cycle 3) — the key a HAND-ATTRIBUTED movement books under.
 *
 * THE PROBLEM IT SOLVES. `settlement_events.idempotency_key` is unique, and
 * the gate key is `${type}:${invoiceId}` — so one leg could take exactly one
 * movement, ever. A part payment is one leg taking two, which Postgres
 * therefore forbade before any code ran. Eval case 2 could not pass.
 *
 * THE KEY IS REPLACED, NEVER REMOVED. Keying on the PAYMENT rather than the
 * leg inverts the guarantee into the one this path actually needs:
 *
 *   gate / webhook   `${type}:${invoiceId}`    one automatic booking per leg
 *   hand-attribution `match:${reference}`      one payment spent once, EVER
 *
 * The two namespaces cannot collide — `match:` is not a leg type. And the
 * guarantee is strictly stronger than a leg-scoped one for this path: the same
 * payment cannot be booked twice against DIFFERENT legs either, which a
 * leg-scoped key would have allowed.
 *
 * WHAT STILL STOPS OVER-APPLICATION is not this key but the outstanding-amount
 * check (`refuseAttribution`, feature folder). Those are two different guards
 * and both are load-bearing: this one stops the same money booking twice, that
 * one stops more money booking than is owed.
 */
export function matchKeyFor(paymentReference: string): string {
  return `match:${paymentReference}`;
}

/**
 * Open the intent record. Written BEFORE any money moves — that ordering is
 * the whole repair, not an implementation detail.
 *
 * The partial unique index refuses a second open row for the same leg, so a
 * double-click cannot start two transfers. A FAILED attempt does not block a
 * retry, and the retry creates a NEW row: the history of attempts is never
 * overwritten.
 */
export async function openPending(db: Db, spec: LegSpec): Promise<string> {
  const id = crypto.randomUUID();
  try {
    await db.insert(pendingSettlements).values({
      id,
      invoiceId: spec.invoiceId,
      type: spec.type,
      rail: spec.railId,
      status: "initiating",
      amountMinor: spec.amountMinor,
      idempotencyKey: idempotencyKeyFor(spec.type, spec.invoiceId),
      entries: toStored(spec.entries),
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new SettlementError(
        "leg-already-in-flight",
        `this ${spec.type} is already in flight — check its status rather than starting another`,
      );
    }
    throw err;
  }
  return id;
}

/**
 * Settle one leg through its rail.
 *
 * Order is load-bearing: record intent → move money → record the rail's
 * reference → consult the rail's own source of truth → book only if verified.
 * A rail that answers "not yet" leaves the row in flight and books nothing;
 * the webhook, or a Check-status press, finishes it later.
 */
export async function settleLeg(
  db: Db,
  spec: LegSpec,
  /** Injectable for tests, exactly as demoWallet() takes its env. Production
   *  callers never pass it. */
  resolveRail: typeof railFor = railFor,
): Promise<LegOutcome> {
  const pendingId = await openPending(db, spec);
  const rail = resolveRail(spec.railId);
  const refs = await resolveRefs(db, spec.railId, spec.invoiceId, {
    from: spec.from,
    to: spec.to,
  });
  const req = {
    idempotencyKey: idempotencyKeyFor(spec.type, spec.invoiceId),
    from: spec.from,
    to: spec.to,
    ...refs,
    amountMinor: spec.amountMinor,
  };

  let receipt;
  try {
    receipt = await rail.execute(req);
  } catch (err) {
    // Nothing moved — or if it did, the rail could not tell us. Either way the
    // row survives as the record that we tried, which is the point.
    const reason = err instanceof Error ? err.message : "the rail refused";
    await markFailed(db, pendingId, reason);
    return { status: "failed", reason, pendingId };
  }

  await db
    .update(pendingSettlements)
    .set({ status: "initiated", railReference: receipt.reference })
    .where(eq(pendingSettlements.id, pendingId));

  return completeSettlement(db, pendingId, resolveRail);
}

/**
 * THE ONE PLACE MONEY BOOKS. Called by the request that started the leg and,
 * later, by the webhook and by Check status — all three go through here, so
 * there is no second booking path to keep in agreement with this one.
 *
 * It never trusts what it was told. It re-reads the rail's own record every
 * time, which is also why out-of-order webhook delivery cannot matter: no
 * delivery's *claim* is ever used, only its arrival as a prompt to look.
 */
export async function completeSettlement(
  db: Db,
  pendingId: string,
  resolveRail: typeof railFor = railFor,
): Promise<LegOutcome> {
  const [row] = await db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.id, pendingId));

  if (!row) {
    throw new SettlementError("pending-not-found", `no pending settlement ${pendingId}`);
  }
  if (row.status === "settled") {
    // Idempotent by design: a duplicate webhook lands here and books nothing.
    // It still advances, because a deal whose money booked before this rule
    // existed is exactly the deal that needs it.
    await advanceFromBookedLegs(db, row.invoiceId);
    return {
      status: "settled",
      reference: row.railReference ?? "",
      eventId: "",
    };
  }
  if (row.status === "failed") {
    return { status: "failed", reason: row.failureReason ?? "failed", pendingId };
  }
  if (!row.railReference) {
    // execute() never returned. Nothing to verify against yet.
    return { status: "pending", reference: null, pendingId };
  }

  const rail = resolveRail(row.rail);
  const actors = actorsFor(row.type);
  const refs = await resolveRefs(db, row.rail, row.invoiceId, actors);
  const req = {
    idempotencyKey: row.idempotencyKey,
    ...actors,
    ...refs,
    amountMinor: row.amountMinor,
    // The row knows when we asked; the rail cannot. Without this a rail that
    // recognises inbound money by arrival has to guess a window, and a guess
    // that starts at "now" reaches backwards past the leg's own beginning.
    initiatedAt: row.initiatedAt ?? undefined,
  };

  let outcome;
  try {
    outcome = await rail.verify(req, { reference: row.railReference });
  } catch (err) {
    // A THROW IS A MISMATCH, not an outcome of the payment: the rail's record
    // contradicts what we expected (wrong amount, wrong recipient, wrong
    // chain). Loud by design — nothing books and the leg fails.
    const reason = err instanceof Error ? err.message : "verification refused";
    await markFailed(db, pendingId, reason);
    return { status: "failed", reason, pendingId };
  }

  if (outcome.status === "pending") {
    // "Not yet" is not "no". Book nothing, fail nothing, stay in flight.
    return { status: "pending", reference: row.railReference, pendingId };
  }
  if (outcome.status === "failed") {
    await markFailed(db, pendingId, outcome.reason);
    return { status: "failed", reason: outcome.reason, pendingId };
  }
  const verified = outcome.transfer;

  // A RAIL REFERENCE BELONGS TO EXACTLY ONE LEG, and cycle 2 found out the
  // hard way why that has to be checked here rather than trusted.
  //
  // An inbound deposit is recognised by amount and arrival window, because a
  // deposit has no id until it exists. Two deals of the SAME face value —
  // entirely ordinary — can therefore both match the same deposit, and the
  // ledger's uniqueness guard then refuses the second booking. Correctly.
  //
  // What must never happen is reading that refusal as "already done". Found
  // live at case 1, 2026-09-18: a real $100 repayment was matched to a
  // deposit that had settled another invoice an hour earlier, the guard
  // refused it, the refusal was read as a duplicate delivery, and the leg was
  // marked settled with nothing booked. The money was paid and no record of
  // it exists — the exact defect FIX 1 exists to prevent, arriving through
  // the one door FIX 1 did not watch.
  const [claimed] = await db
    .select({ key: settlementEvents.idempotencyKey })
    .from(settlementEvents)
    .where(eq(settlementEvents.evidenceRef, verified.reference));
  if (claimed && claimed.key !== row.idempotencyKey) {
    const reason =
      `the rail's record for this leg points at ${verified.reference}, which already settled a different leg. ` +
      `Nothing has been booked — this is a reconciliation exception (cycle 3).`;
    await markFailed(db, pendingId, reason);
    return { status: "failed", reason, pendingId };
  }

  const entries = parseStoredEntries(row.entries);
  let eventId: string;
  try {
    const booked = await bookMovement(db, {
      invoiceId: row.invoiceId,
      type: row.type,
      evidenceKind: verified.evidenceKind,
      evidenceRef: verified.reference,
      idempotencyKey: row.idempotencyKey,
      entries,
    });
    eventId = booked.eventId;
  } catch (err) {
    if (err instanceof LedgerError && err.rule === "ledger-already-recorded") {
      // Two deliveries raced — but ONLY if the movement that exists is this
      // leg's. The same refusal is raised when the evidence belongs to
      // somebody else, and calling that "settled" is how a payment goes
      // missing. Check whose it is before believing it.
      const [mine] = await db
        .select({ id: settlementEvents.id })
        .from(settlementEvents)
        .where(eq(settlementEvents.idempotencyKey, row.idempotencyKey));
      if (mine) {
        await markSettled(db, pendingId);
        await advanceFromBookedLegs(db, row.invoiceId);
        return { status: "settled", reference: verified.reference, eventId: "" };
      }
      const reason =
        `the ledger refused this booking as already recorded, but no movement exists for this leg — ` +
        `its evidence ${verified.reference} belongs to another. Nothing booked; a reconciliation exception (cycle 3).`;
      await markFailed(db, pendingId, reason);
      return { status: "failed", reason, pendingId };
    }
    throw err;
  }

  await markSettled(db, pendingId);
  await advanceFromBookedLegs(db, row.invoiceId);
  return { status: "settled", reference: verified.reference, eventId };
}

/**
 * Rail addressing for the counterparties. The seam is framework-free and may
 * not read the database, so the lookup happens HERE — in the one module both
 * the initiating request and the webhook already go through, which is what
 * keeps the two paths from drifting.
 *
 * `partyId` is null for the platform's own destination. A leg with no
 * registered destination resolves to undefined, and the rail refuses at
 * prepare() with a message naming the party — never at execute.
 */
async function resolveRefs(
  db: Db,
  rail: RailId,
  invoiceId: string,
  actors: { from: RailActor; to: RailActor },
): Promise<{ fromRef?: string; toRef?: string }> {
  const rows = await db
    .select()
    .from(settlementDestinations)
    .where(eq(settlementDestinations.rail, rail));
  if (rows.length === 0) return {};

  const [inv] = await db
    .select({ supplierId: invoices.supplierId, debtorId: invoices.debtorId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));

  const partyFor = (actor: RailActor): string | null => {
    if (actor === "supplier") return inv?.supplierId ?? null;
    if (actor === "debtor") return inv?.debtorId ?? null;
    if (actor === "platform") return null;
    return null; // funder: the single demo funder shares the platform's registry row
  };
  const pick = (actor: RailActor) => {
    const partyId = partyFor(actor);
    return (
      rows.find((r) => r.partyId === partyId)?.externalId ??
      rows.find((r) => r.partyId === null)?.externalId
    );
  };
  return { fromRef: pick(actors.from), toRef: pick(actors.to) };
}

/** Which actors a leg moves between — the rail maps these to its own addressing. */
/**
 * THE DEAL ADVANCES WHERE THE MONEY BOOKS.
 *
 * Cycle 0 and 1 advanced the invoice in the request that pressed the gate,
 * because on an immediate rail the booking and the request were the same
 * moment. On a deferred rail they are not, and cycle 2 shipped the gap: a
 * fiat leg booked its money through the webhook and the deal stayed where it
 * was — Fund still offered, Disburse still refused, with the funding movement
 * sitting in the ledger. Found live at case 1, 2026-09-18.
 *
 * So the transition moves here, beside the booking, where all three paths —
 * the initiating request, the webhook, and Check status — already pass.
 *
 * It is derived from BOOKED MOVEMENTS rather than from the completion that
 * triggered it. That is what makes it repair rather than merely record: a
 * deal already stuck, whose pending row is settled and whose completion will
 * never fire again, still advances the next time anything calls it. It also
 * only ever moves forward — a replayed webhook cannot walk a deal backwards.
 */
const MONEY_PROGRESSION = ["priced", "funded", "disbursed", "repaid", "settled"] as const;
type MoneyStatus = (typeof MONEY_PROGRESSION)[number];

export async function advanceFromBookedLegs(db: Db, invoiceId: string): Promise<void> {
  const booked = await db
    .select({ type: settlementEvents.type })
    .from(settlementEvents)
    .where(eq(settlementEvents.invoiceId, invoiceId));
  const kinds = new Set<string>(booked.map((b) => b.type));

  // The furthest state the booked money justifies. Payout and residual settle
  // the deal only together, in either order — cycle 1's rule, unchanged.
  const target: MoneyStatus | null =
    kinds.has("payout") && kinds.has("residual")
      ? "settled"
      : kinds.has("repayment")
        ? "repaid"
        : kinds.has("disbursement")
          ? "disbursed"
          : kinds.has("funding")
            ? "funded"
            : null;
  if (!target) return;

  const [inv] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!inv) return;

  const from = MONEY_PROGRESSION.indexOf(inv.status as MoneyStatus);
  const to = MONEY_PROGRESSION.indexOf(target);
  // -1 is a status off this path entirely (submitted, returned, refused):
  // not ours to move. `to <= from` is a replay, or a leg that booked out of
  // order — either way, nothing to do.
  if (from === -1 || to <= from) return;

  // Compare-and-swap on the status we read, so two deliveries racing here
  // cannot both advance.
  await db
    .update(invoices)
    .set({ status: target })
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, inv.status)));
}

export function actorsFor(type: LegType): { from: RailActor; to: RailActor } {
  switch (type) {
    case "funding":
      return { from: "funder", to: "platform" };
    case "disbursement":
      return { from: "platform", to: "supplier" };
    case "repayment":
      return { from: "debtor", to: "platform" };
    case "payout":
      return { from: "platform", to: "funder" };
    case "residual":
      return { from: "platform", to: "supplier" };
  }
}

async function markSettled(db: Db, pendingId: string): Promise<void> {
  await db
    .update(pendingSettlements)
    .set({ status: "settled", resolvedAt: new Date() })
    .where(eq(pendingSettlements.id, pendingId));
}

async function markFailed(db: Db, pendingId: string, reason: string): Promise<void> {
  await db
    .update(pendingSettlements)
    .set({ status: "failed", failureReason: reason, resolvedAt: new Date() })
    .where(eq(pendingSettlements.id, pendingId));
}

/** Open in-flight legs for a set of invoices — what the screens render. */
export async function openLegsFor(db: Db, invoiceIds: string[]) {
  if (invoiceIds.length === 0) return [];
  return db
    .select()
    .from(pendingSettlements)
    .where(
      and(
        sql`${pendingSettlements.invoiceId} = ANY(${invoiceIds})`,
        sql`${pendingSettlements.status} IN ('initiating','initiated')`,
      ),
    );
}

/** Resolve a delivery to its leg: the webhook knows only the rail's own id. */
export async function findByRailReference(db: Db, reference: string) {
  const [row] = await db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.railReference, reference));
  return row ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    /duplicate key|unique constraint/i.test(e?.message ?? "")
  );
}

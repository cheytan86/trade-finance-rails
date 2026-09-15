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
import { pendingSettlements, settlementDestinations } from "../../db/schema.ts";
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

/** The key both guards share: one leg, one movement, one in-flight row. */
export function idempotencyKeyFor(type: LegType, invoiceId: string): string {
  return `${type}:${invoiceId}`;
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
    // Idempotent by design: a duplicate webhook lands here and does nothing.
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
      // Two deliveries raced. The database settled it; this one is a no-op.
      await markSettled(db, pendingId);
      return { status: "settled", reference: verified.reference, eventId: "" };
    }
    throw err;
  }

  await markSettled(db, pendingId);
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

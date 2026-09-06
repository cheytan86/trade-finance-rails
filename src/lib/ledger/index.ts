// THE LEDGER CORE — the only module allowed to write settlement_events and
// ledger_entries. Every movement: two or more entries summing to zero.
// Balances are never stored; balanceOf/balances derive them by SUM at read.
// Changing any rule here is a decision, never a refactor (STACK_RULES.md).

import { eq, sql } from "drizzle-orm";
// Relative + explicit .ts so the module resolves under Next, vitest AND plain
// Node (the seed runs under node, which never reads tsconfig path aliases).
import { settlementEvents, ledgerEntries } from "../../db/schema.ts";
import type { Db } from "../../db/client.ts";

export class LedgerError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

export interface EntryInput {
  accountId: string;
  amountMinor: bigint;
}

export interface MovementInput {
  invoiceId: string;
  type: "funding" | "disbursement";
  evidenceKind?: "demo-internal" | "tx-hash" | "circle-payment-id" | "statement-line";
  evidenceRef: string;
  idempotencyKey: string;
  entries: EntryInput[];
}

/** Pure validation — throws with a named rule; nothing touches the database
 *  until this has passed. */
export function validateEntries(entries: EntryInput[]): void {
  if (entries.length < 2) {
    throw new LedgerError(
      "ledger-min-entries",
      `a movement needs at least two entries; got ${entries.length}`,
    );
  }
  let sum = 0n;
  for (const e of entries) {
    if (typeof e.amountMinor !== "bigint") {
      throw new LedgerError("ledger-integer", "entry amounts must be bigint minor units");
    }
    if (e.amountMinor === 0n) {
      throw new LedgerError("ledger-zero-amount", "a zero entry says nothing and books nothing");
    }
    sum += e.amountMinor;
  }
  if (sum !== 0n) {
    throw new LedgerError(
      "ledger-balanced",
      `entries must sum to zero; got ${sum.toString()} minor units`,
    );
  }
}

/**
 * Book one movement atomically: the event and its entries in a single batch
 * (one transaction on the Neon HTTP driver). IDs are generated client-side so
 * the batch needs no round trip. A duplicate idempotency key surfaces as
 * LedgerError("ledger-already-recorded") — the constraint lives in Postgres,
 * this just translates it.
 */
export async function bookMovement(db: Db, m: MovementInput): Promise<{ eventId: string }> {
  validateEntries(m.entries);
  const eventId = crypto.randomUUID();
  try {
    await db.batch([
      db.insert(settlementEvents).values({
        id: eventId,
        invoiceId: m.invoiceId,
        type: m.type,
        evidenceKind: m.evidenceKind ?? "demo-internal",
        evidenceRef: m.evidenceRef,
        idempotencyKey: m.idempotencyKey,
      }),
      db.insert(ledgerEntries).values(
        m.entries.map((e) => ({
          id: crypto.randomUUID(),
          eventId,
          accountId: e.accountId,
          amountMinor: e.amountMinor,
        })),
      ),
    ]);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new LedgerError(
        "ledger-already-recorded",
        `movement with idempotency key "${m.idempotencyKey}" is already recorded`,
      );
    }
    throw err;
  }
  return { eventId };
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string; cause?: { code?: string } };
  return (
    e?.code === "23505" ||
    e?.cause?.code === "23505" ||
    /duplicate key|unique constraint/i.test(e?.message ?? "")
  );
}

/** SUM(entries) for one account — the only definition of a balance. */
export async function balanceOf(db: Db, accountId: string): Promise<bigint> {
  const [row] = await db
    .select({ sum: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}), 0)` })
    .from(ledgerEntries)
    .where(eq(ledgerEntries.accountId, accountId));
  return BigInt(row.sum);
}

/** All balances at once, derived, for the ledger view. */
export async function balances(db: Db): Promise<Map<string, bigint>> {
  const rows = await db
    .select({
      accountId: ledgerEntries.accountId,
      sum: sql<string>`sum(${ledgerEntries.amountMinor})`,
    })
    .from(ledgerEntries)
    .groupBy(ledgerEntries.accountId);
  return new Map(rows.map((r) => [r.accountId, BigInt(r.sum)]));
}

// FIX 1, proved — against the real database, and BEFORE any Circle code
// exists. That ordering is deliberate: the defect these tests pin down is a
// defect in the rails the product already ships, not a property of the new
// one. Cycle 1's USDC rail could broadcast a transfer and then fail to record
// it (docs/product/settlement-usdc/deploy.md, D2).
//
// The rail is injected rather than mocked at the module boundary, the same
// seam demoWallet() uses for its env. Each fake stands for a real behaviour
// the product has actually met.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { RailError, type SettlementRail } from "@/lib/rails";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI or a fresh clone: the guard below handles it */
}

const HAS_DB = Boolean(process.env.DATABASE_URL);

const { getDb } = await import("@/db/client");
const { invoices, accounts, parties, pendingSettlements, settlementEvents, ledgerEntries } =
  await import("@/db/schema");
const { balances } = await import("@/lib/ledger");
const { settleLeg, completeSettlement, openPending, idempotencyKeyFor, SettlementError } =
  await import("./pending");

const db = getDb();
const createdInvoiceIds: string[] = [];

let supplierId: string;
let clientMoneyId: string;
let platformOwnId: string;

/** A rail that settles instantly — cycle 0's behaviour. */
const instantRail = (ref = "demo:ok"): SettlementRail => ({
  id: "demo-internal",
  label: "instant (test)",
  settlement: "immediate",
  prepare: async () => ({
    rail: "demo-internal",
    amountMinor: 0n,
    fromLabel: "a",
    toLabel: "b",
    onChain: false,
  }),
  execute: async () => ({ reference: ref }),
  verify: async () => ({
    status: "settled",
    transfer: {
      reference: ref,
      evidenceKind: "demo-internal",
      amountMinor: 0n,
      from: "a",
      to: "b",
    },
  }),
});

/** Money has moved; the rail cannot confirm it yet. THE cycle-1 scenario.
 *  Since A3 this is a RETURNED outcome, not a thrown error — "not yet" stopped
 *  having to disguise itself as a failure. */
const stallsAfterSending = (ref: string): SettlementRail => ({
  ...instantRail(ref),
  verify: async () => ({ status: "pending", detail: `${ref} has not confirmed yet` }),
});

/** The rail's record says it will not happen — distinct from a mismatch. */
const railReportsFailure = (ref: string): SettlementRail => ({
  ...instantRail(ref),
  verify: async () => ({ status: "failed", reason: `${ref} was rejected by the rail` }),
});

/** The rail's own record contradicts what we expected — a real refusal. */
const refusesOnVerify = (ref: string): SettlementRail => ({
  ...instantRail(ref),
  verify: async () => {
    throw new RailError("rail-wrong-amount", "the transfer was for a different amount");
  },
});

/** execute() itself throws — nothing moved, or the rail could not say. */
const refusesOnExecute: SettlementRail = {
  ...instantRail(),
  execute: async () => {
    throw new RailError("rail-unreachable", "the rail did not answer");
  },
};

beforeAll(async () => {
  if (!HAS_DB) return;
  const [supplier] = await db.select().from(parties).where(eq(parties.role, "supplier")).limit(1);
  supplierId = supplier.id;
  const accs = await db.select().from(accounts);
  clientMoneyId = accs.find((a) => a.kind === "client_collections")!.id;
  platformOwnId = accs.find((a) => a.kind === "platform_operating")!.id;
});

afterAll(async () => {
  if (!HAS_DB || createdInvoiceIds.length === 0) return;
  const evs = await db
    .select({ id: settlementEvents.id })
    .from(settlementEvents)
    .where(inArray(settlementEvents.invoiceId, createdInvoiceIds));
  if (evs.length) {
    await db.delete(ledgerEntries).where(
      inArray(
        ledgerEntries.eventId,
        evs.map((e) => e.id),
      ),
    );
    await db
      .delete(settlementEvents)
      .where(inArray(settlementEvents.invoiceId, createdInvoiceIds));
  }
  await db
    .delete(pendingSettlements)
    .where(inArray(pendingSettlements.invoiceId, createdInvoiceIds));
  await db.delete(invoices).where(inArray(invoices.id, createdInvoiceIds));
});

/** A throwaway invoice — pending rows only need a real foreign key. */
async function anInvoice(): Promise<string> {
  const [debtor] = await db.select().from(parties).where(eq(parties.role, "debtor")).limit(1);
  const [row] = await db
    .insert(invoices)
    .values({
      supplierId,
      debtorId: debtor.id,
      faceValueMinor: 100_000n,
      dueDate: "2027-01-01",
      status: "submitted",
    })
    .returning({ id: invoices.id });
  createdInvoiceIds.push(row.id);
  return row.id;
}

/** Two entries that sum to zero, so the ledger has no reason to refuse. */
function balancedEntries() {
  return [
    { accountId: clientMoneyId, amountMinor: -1_000n },
    { accountId: platformOwnId, amountMinor: 1_000n },
  ];
}

const spec = (invoiceId: string) => ({
  railId: "demo-internal" as const,
  invoiceId,
  type: "disbursement" as const,
  from: "platform" as const,
  to: "supplier" as const,
  amountMinor: 1_000n,
  entries: balancedEntries(),
});

async function pendingRowsFor(invoiceId: string) {
  return db.select().from(pendingSettlements).where(eq(pendingSettlements.invoiceId, invoiceId));
}

describe.skipIf(!HAS_DB)("FIX 1 — a movement can never be attempted without a record", () => {
  it("the intent row exists BEFORE the rail is asked to move anything", async () => {
    const invoiceId = await anInvoice();
    let rowsSeenByExecute = 0;
    const observingRail: SettlementRail = {
      ...instantRail("demo:observed"),
      execute: async () => {
        // The row must already exist at the instant money moves. That
        // ordering IS the repair; asserting it after the fact would not
        // distinguish "written first" from "written last".
        rowsSeenByExecute = (await pendingRowsFor(invoiceId)).length;
        return { reference: "demo:observed" };
      },
    };
    await settleLeg(db, spec(invoiceId), () => observingRail);
    expect(rowsSeenByExecute).toBe(1);
  });

  it("a rail that sends and then cannot confirm leaves a durable row, not silence", async () => {
    const invoiceId = await anInvoice();
    const before = await balances(db);

    const outcome = await settleLeg(db, spec(invoiceId), () =>
      stallsAfterSending("0xbroadcast-but-unconfirmed"),
    );

    expect(outcome.status).toBe("pending");
    const [row] = await pendingRowsFor(invoiceId);
    // The reference survives — which is what makes recovery possible at all.
    expect(row.status).toBe("initiated");
    expect(row.railReference).toBe("0xbroadcast-but-unconfirmed");
    // And nothing booked: in-flight money is not money.
    expect(await countEvents(invoiceId)).toBe(0);
    expect(await balances(db)).toEqual(before);
  });

  it("the stalled leg settles later through the SAME path a webhook uses", async () => {
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => stallsAfterSending("ref-late"));
    const [row] = await pendingRowsFor(invoiceId);

    // Nothing is re-sent. The rail's own record is consulted again — which is
    // exactly what Check status and the webhook both do.
    const outcome = await completeSettlement(db, row.id, () => instantRail("ref-late"));

    expect(outcome.status).toBe("settled");
    expect(await countEvents(invoiceId)).toBe(1);
    const [after] = await pendingRowsFor(invoiceId);
    expect(after.status).toBe("settled");
    expect(after.resolvedAt).not.toBeNull();
  });

  it("completing twice books once — a duplicate delivery is a no-op", async () => {
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => stallsAfterSending("ref-dupe"));
    const [row] = await pendingRowsFor(invoiceId);

    const first = await completeSettlement(db, row.id, () => instantRail("ref-dupe"));
    const second = await completeSettlement(db, row.id, () => instantRail("ref-dupe"));

    expect(first.status).toBe("settled");
    expect(second.status).toBe("settled");
    expect(await countEvents(invoiceId)).toBe(1);
  });
});

describe.skipIf(!HAS_DB)("refusals book nothing, and say which kind of nothing", () => {
  it("a rail that refuses on verify fails the leg — it does not leave it hanging", async () => {
    const invoiceId = await anInvoice();
    const outcome = await settleLeg(db, spec(invoiceId), () => refusesOnVerify("ref-wrong"));
    expect(outcome.status).toBe("failed");
    const [row] = await pendingRowsFor(invoiceId);
    expect(row.status).toBe("failed");
    expect(row.failureReason).toMatch(/different amount/i);
    expect(await countEvents(invoiceId)).toBe(0);
  });

  it("a rail that refuses on execute still leaves the record that we tried", async () => {
    const invoiceId = await anInvoice();
    const outcome = await settleLeg(db, spec(invoiceId), () => refusesOnExecute);
    expect(outcome.status).toBe("failed");
    const [row] = await pendingRowsFor(invoiceId);
    expect(row.status).toBe("failed");
    expect(await countEvents(invoiceId)).toBe(0);
  });

  it("a rail REPORTING failure is distinct from a rail refusing a mismatch", async () => {
    // Both end the leg, and the reason text is what tells them apart: one is
    // the payment's own outcome, the other is a sign something is wrong.
    const reported = await anInvoice();
    const mismatched = await anInvoice();
    const a = await settleLeg(db, spec(reported), () => railReportsFailure("r-fail"));
    const b = await settleLeg(db, spec(mismatched), () => refusesOnVerify("r-mismatch"));

    expect(a.status).toBe("failed");
    expect(b.status).toBe("failed");
    if (a.status !== "failed" || b.status !== "failed") throw new Error("unreachable");
    expect(a.reason).toMatch(/rejected by the rail/i);
    expect(b.reason).toMatch(/different amount/i);
    expect(await countEvents(reported)).toBe(0);
    expect(await countEvents(mismatched)).toBe(0);
  });

  it("'not yet' is not 'no' — the two outcomes are distinguishable", async () => {
    const stalled = await anInvoice();
    const refused = await anInvoice();
    const a = await settleLeg(db, spec(stalled), () => stallsAfterSending("r1"));
    const b = await settleLeg(db, spec(refused), () => refusesOnVerify("r2"));
    expect(a.status).toBe("pending");
    expect(b.status).toBe("failed");
  });
});

describe.skipIf(!HAS_DB)("one leg is never in flight twice", () => {
  it("a second open row for the same leg is refused by the database", async () => {
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => stallsAfterSending("ref-once"));

    await expect(openPending(db, spec(invoiceId))).rejects.toThrow(SettlementError);
    expect(await pendingRowsFor(invoiceId)).toHaveLength(1);
  });

  it("but a FAILED attempt does not block a retry, and keeps its own history", async () => {
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => refusesOnExecute);
    // The partial index only constrains open rows, so the retry is allowed —
    // and it creates a NEW row rather than overwriting the failure.
    const retry = await settleLeg(db, spec(invoiceId), () => instantRail("ref-retry"));

    expect(retry.status).toBe("settled");
    const rows = await pendingRowsFor(invoiceId);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.status === "failed")).toHaveLength(1);
    expect(rows.filter((r) => r.status === "settled")).toHaveLength(1);
  });

  it("the in-flight key is the SAME key the ledger uses — one guard, not two", () => {
    expect(idempotencyKeyFor("disbursement", "abc")).toBe("disbursement:abc");
  });
});

async function countEvents(invoiceId: string): Promise<number> {
  const rows = await db
    .select({ id: settlementEvents.id })
    .from(settlementEvents)
    .where(eq(settlementEvents.invoiceId, invoiceId));
  return rows.length;
}

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
const { balances, bookMovement } = await import("@/lib/ledger");
const { settleLeg, completeSettlement, openPending, idempotencyKeyFor, matchKeyFor, SettlementError } =
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
  // cycle 3: the interface gained listInbound(). A demo rail has no outside.
  listInbound: async () => ({
    supported: false as const,
    reason: "test rail",
  }),
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

  // The other half of the same defect. matchInboundDeposit already refused a
  // deposit that landed before we asked — and its unit test passed all along,
  // because the test handed it the right timestamp. Production handed it
  // `now − one hour`, a window that reaches backwards past the leg's own
  // beginning and grows the longer you wait. A correct function, called
  // incorrectly: the caller must pass the row's own initiated_at.
  it("verify is told when THIS leg asked for the money, not a sliding window", async () => {
    const invoiceId = await anInvoice();
    let seen: Date | undefined;
    const capturing: SettlementRail = {
      ...instantRail("demo:when"),
      verify: async (req, receipt) => {
        seen = req.initiatedAt;
        return instantRail("demo:when").verify(req, receipt);
      },
    };
    await settleLeg(db, spec(invoiceId), () => capturing);

    const [row] = await pendingRowsFor(invoiceId);
    expect(seen).toBeInstanceOf(Date);
    // It is the row's own timestamp — not "an hour ago", which is what the
    // defect passed and what would let somebody else's deposit qualify.
    expect(seen!.getTime()).toBe(row.initiatedAt!.getTime());
    expect(Date.now() - seen!.getTime()).toBeLessThan(60 * 60_000);
  });

  // Found live at case 1, 2026-09-18, and it cost a real $100 repayment.
  // An inbound deposit is matched by amount and window, so two deals of the
  // same face value can match the same deposit. The ledger refuses the second
  // booking — correctly — and the bug was reading that refusal as "this leg is
  // already done" and marking it settled with nothing booked.
  it("evidence that belongs to ANOTHER leg is refused, not mistaken for a duplicate", async () => {
    const first = await anInvoice();
    const second = await anInvoice();
    const shared = `demo:shared-${crypto.randomUUID()}`;

    // The first leg legitimately settles on this reference.
    const a = await settleLeg(db, spec(first), () => instantRail(shared));
    expect(a.status).toBe("settled");
    expect(await countEvents(first)).toBe(1);

    // A second, different leg whose rail hands back the SAME reference.
    const before = await balances(db);
    const b = await settleLeg(db, spec(second), () => instantRail(shared));

    // THE REFUSAL IS UNCHANGED AND RE-ASSERTED: nothing books, nothing moves,
    // and it is emphatically not read as "already done".
    expect(b.status).not.toBe("settled");
    expect(await countEvents(second)).toBe(0);
    expect(await balances(db)).toEqual(before);

    // WHAT CHANGED AT CYCLE 3 (FIX B, second direction). This used to mark the
    // leg `failed`, which is terminal — so a leg that nothing was wrong with
    // died while the money sat there. Two legs of the same amount is ordinary,
    // the deposit is real, and one of them is very likely its owner. The
    // product has discovered that it CANNOT TELL, which is an exception for a
    // person, not a failure of the payment.
    const [row] = await pendingRowsFor(second);
    expect(row.status).not.toBe("failed");
    expect(["initiating", "initiated"]).toContain(row.status);
    expect(row.resolvedAt).toBeNull();
  });

  // Deploy, 2026-09-18. The webhook route decides "did THIS delivery book it?"
  // from eventId, and labels the row `applied` or `ignored` accordingly. That
  // distinction is the only thing that lets the records answer whether money
  // was booked by a webhook or by a person — so it is pinned here, at the
  // source, rather than trusted.
  it("a booking returns its event id; a duplicate returns none", async () => {
    const invoiceId = await anInvoice();
    const rail = () => instantRail("demo:once");

    const first = await settleLeg(db, spec(invoiceId), rail);
    expect(first.status).toBe("settled");
    // THIS call booked it, and says so.
    expect((first as { eventId: string }).eventId).not.toBe("");

    // The same leg, delivered again — settled, but booked by nobody new.
    const [row] = await pendingRowsFor(invoiceId);
    const again = await completeSettlement(db, row.id, rail);
    expect(again.status).toBe("settled");
    expect((again as { eventId: string }).eventId).toBe("");

    // And still exactly one movement, which is the point of the distinction.
    expect(await countEvents(invoiceId)).toBe(1);
  });

  it("the in-flight key is the SAME key the ledger uses — one guard, not two", () => {
    expect(idempotencyKeyFor("disbursement", "abc")).toBe("disbursement:abc");
  });
});

describe.skipIf(!HAS_DB)("FIX A — one leg may receive more than one movement", () => {
  // THE CURRENT BEHAVIOUR, PINNED FIRST. The delta is only provable against a
  // recorded `before`, and this one is not a bug in anybody's code — it is a
  // unique index doing exactly what cycle 2 asked of it.
  it("PINS THE DEFECT: the gate key allows a leg exactly one movement", async () => {
    const invoiceId = await anInvoice();
    const key = idempotencyKeyFor("repayment", invoiceId);

    await bookMovement(db, {
      invoiceId,
      type: "repayment",
      evidenceKind: "circle-payment-id",
      evidenceRef: `dep-first-${invoiceId}`,
      idempotencyKey: key,
      entries: balancedEntries(),
    });

    // A part payment is one leg taking a SECOND movement. Under the gate key,
    // Postgres refuses it before any application code gets a say — which is
    // why eval case 2 could not pass against the schema as it stood.
    await expect(
      bookMovement(db, {
        invoiceId,
        type: "repayment",
        evidenceKind: "circle-payment-id",
        evidenceRef: `dep-second-${invoiceId}`,
        idempotencyKey: key,
        entries: balancedEntries(),
      }),
    ).rejects.toThrow(/already recorded/i);

    expect(await countEvents(invoiceId)).toBe(1);
  });

  it("THE DELTA: keyed on the payment, the same leg takes two movements", async () => {
    const invoiceId = await anInvoice();

    await bookMovement(db, {
      invoiceId,
      type: "repayment",
      evidenceKind: "circle-payment-id",
      evidenceRef: `part-a-${invoiceId}`,
      idempotencyKey: matchKeyFor(`part-a-${invoiceId}`),
      entries: balancedEntries(),
    });
    await bookMovement(db, {
      invoiceId,
      type: "repayment",
      evidenceKind: "circle-payment-id",
      evidenceRef: `part-b-${invoiceId}`,
      idempotencyKey: matchKeyFor(`part-b-${invoiceId}`),
      entries: balancedEntries(),
    });

    expect(await countEvents(invoiceId)).toBe(2);
  });

  it("but ONE PAYMENT is still spent exactly once — even across different legs", async () => {
    // Strictly stronger than the leg-scoped key it replaces: a leg-scoped key
    // would have let the same money settle two different invoices.
    const first = await anInvoice();
    const second = await anInvoice();
    const reference = `shared-deposit-${first}`;

    await bookMovement(db, {
      invoiceId: first,
      type: "repayment",
      evidenceKind: "circle-payment-id",
      evidenceRef: reference,
      idempotencyKey: matchKeyFor(reference),
      entries: balancedEntries(),
    });

    await expect(
      bookMovement(db, {
        invoiceId: second,
        type: "repayment",
        evidenceKind: "circle-payment-id",
        evidenceRef: reference,
        idempotencyKey: matchKeyFor(reference),
        entries: balancedEntries(),
      }),
    ).rejects.toThrow(/already recorded|duplicate|unique/i);

    expect(await countEvents(second)).toBe(0);
  });

  it("the two namespaces cannot collide", () => {
    // `match:` is not a leg type, so no gate key can ever equal a match key.
    expect(matchKeyFor("abc")).toBe("match:abc");
    expect(idempotencyKeyFor("repayment", "abc")).toBe("repayment:abc");
    expect(matchKeyFor("abc")).not.toBe(idempotencyKeyFor("repayment", "abc"));
  });
});

describe.skipIf(!HAS_DB)("FIX 1 — one duration, one clock", () => {
  // WHY THIS TEST EXISTS. `initiatedAt` is stamped by the database
  // (`defaultNow()`); `resolvedAt` WAS stamped by the application
  // (`new Date()`). Two machines, ~60 ms apart. Nothing subtracted them until
  // cycle 4, so the disagreement was invisible for two cycles — and on
  // demo-internal, where a whole settlement takes 78 ms, the skew is larger
  // than the measurement. Live rows on 2026-09-24 produced a NEGATIVE median.
  //
  // This is the fastest rail the product has, which makes it the one that
  // catches the defect. A test on circle-fiat would pass with the bug in place.

  it("a settled leg's duration is never negative", async () => {
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => instantRail());

    const [row] = await pendingRowsFor(invoiceId);
    expect(row.status).toBe("settled");
    expect(row.resolvedAt).not.toBeNull();

    const ms = row.resolvedAt!.getTime() - row.initiatedAt.getTime();
    // The assertion that would have failed before the fix. Not "small" —
    // NOT NEGATIVE. A duration below zero is not a slow rail or a fast one;
    // it is a measurement that cannot be true.
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it("a FAILED leg's duration is never negative either", async () => {
    // markFailed takes the same stamp on the same path. A rail that refuses
    // still produced a duration, and cycle 4's comparison counts it.
    const invoiceId = await anInvoice();
    await settleLeg(db, spec(invoiceId), () => refusesOnVerify("ref-fix1-failed"));

    const [row] = await pendingRowsFor(invoiceId);
    expect(row.status).toBe("failed");
    expect(row.resolvedAt).not.toBeNull();
    expect(row.resolvedAt!.getTime() - row.initiatedAt.getTime()).toBeGreaterThanOrEqual(0);
  });
});

async function countEvents(invoiceId: string): Promise<number> {
  const rows = await db
    .select({ id: settlementEvents.id })
    .from(settlementEvents)
    .where(eq(settlementEvents.invoiceId, invoiceId));
  return rows.length;
}

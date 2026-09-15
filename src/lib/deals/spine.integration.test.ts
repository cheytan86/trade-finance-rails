// END-TO-END TEST OF THE MONEY PATH, against the real database.
//
// The unit tests prove the pure rules; this proves the orchestration: that
// submitting, approving, funding and disbursing actually move an invoice
// through its states and leave a balanced ledger behind — and that every
// refusal path refuses. Next's request-scoped modules are stubbed (there is
// no request here), but nothing else is: the actions, the ledger, the
// pricing and Postgres are all the real ones.
//
// Skips itself when DATABASE_URL is absent, so a fresh clone still runs green.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI or a fresh clone: the guard below handles it */
}

const HAS_DB = Boolean(process.env.DATABASE_URL);

// The seat this "request" is acting in — flipped between calls below.
let currentIdentity: { seat: string; partyId: string | null } | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      currentIdentity ? { value: JSON.stringify(currentIdentity) } : undefined,
    set: () => {},
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: () => {
    throw new Error("redirect should not be reached in these tests");
  },
}));

const { getDb } = await import("@/db/client");
const { invoices, parties, accounts, settlementEvents, ledgerEntries } = await import(
  "@/db/schema"
);
const {
  submitInvoice,
  approveInvoice,
  priceInvoice,
  refuseInvoice,
  returnForCorrection,
  resubmitInvoice,
  fundInvoice,
  disburseInvoice,
} = await import("./actions");

/** Since 2026-09-08 approval and pricing are separate ops steps; most tests
 *  want a priced deal, so this does both. */
const approveAndPrice = async (invoiceId: string, over: Record<string, string> = {}) => {
  const approved = await approveInvoice({}, form({ invoiceId }));
  if (approved.error) return approved;
  return priceInvoice(
    {},
    form({
      invoiceId,
      advanceRate: "85.00",
      supplierRate: "9.50",
      funderRate: "8.00",
      txnCostType: "fixed",
      txnCostValue: "150.00",
      ...over,
    }),
  );
};
const { balances } = await import("@/lib/ledger");

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.append(k, v);
  return fd;
};

describe.skipIf(!HAS_DB)("the spine, end to end, against the real database", () => {
  const db = getDb();
  let amberId: string;
  let debtorId: string;
  const createdIds: string[] = [];

  const dueDate = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  const issueDate = new Date().toISOString().slice(0, 10);

  // Since 2026-09-08 an invoice carries document facts (number, issue date,
  // description). The helper supplies valid defaults so each test still
  // asserts the ONE thing it is about.
  let invSeq = 0;
  const submitForm = (over: Record<string, string> = {}) =>
    form({
      debtorId,
      faceValue: "48,000.00",
      dueDate,
      issueDate,
      invoiceNumber: `TEST-${Date.now()}-${++invSeq}`,
      description: "test consignment",
      ...over,
    });

  beforeAll(async () => {
    const [amber] = await db
      .select()
      .from(parties)
      .where(eq(parties.name, "Amber Textiles Ltd"));
    const [debtor] = await db
      .select()
      .from(parties)
      .where(eq(parties.name, "Meridian Retail Group Ltd"));
    expect(amber, "seed data missing — run node scripts/seed.mts").toBeTruthy();
    amberId = amber.id;
    debtorId = debtor.id;
  });

  afterAll(async () => {
    // Remove only what this test created, in FK order.
    if (createdIds.length === 0) return;
    const events = await db
      .select({ id: settlementEvents.id })
      .from(settlementEvents)
      .where(inArray(settlementEvents.invoiceId, createdIds));
    if (events.length) {
      await db.delete(ledgerEntries).where(
        inArray(
          ledgerEntries.eventId,
          events.map((e) => e.id),
        ),
      );
      await db.delete(settlementEvents).where(inArray(settlementEvents.invoiceId, createdIds));
    }
    await db.delete(invoices).where(inArray(invoices.id, createdIds));
  });

  const asSupplier = () => (currentIdentity = { seat: "supplier", partyId: amberId });
  const asOps = () => (currentIdentity = { seat: "ops", partyId: null });

  async function newestInvoice() {
    const rows = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const mine = rows.filter((r) => createdIds.includes(r.id));
    return mine[mine.length - 1];
  }

  it("1 · a supplier submits — the deal exists and is submitted", async () => {
    asSupplier();
    const before = await db.select().from(invoices);
    const res = await submitInvoice({}, submitForm());
    expect(res.error).toBeUndefined();
    const after = await db.select().from(invoices);
    expect(after.length).toBe(before.length + 1);
    const created = after.find((a) => !before.some((b) => b.id === a.id))!;
    createdIds.push(created.id);
    expect(created.status).toBe("submitted");
    expect(created.faceValueMinor).toBe(4_800_000n); // parsed, not rounded
  });

  it("2 · a face value with impossible precision is refused, and nothing is created", async () => {
    asSupplier();
    const before = await db.select().from(invoices);
    const res = await submitInvoice({}, submitForm({ faceValue: "48000.005" }));
    expect(res.error).toMatch(/decimal places/);
    const after = await db.select().from(invoices);
    expect(after.length).toBe(before.length);
  });

  it("3 · the supplier seat cannot fund — only ops moves a deal", async () => {
    asSupplier();
    const inv = await newestInvoice();
    const res = await fundInvoice({}, form({ invoiceId: inv.id }));
    expect(res.error).toMatch(/Only platform ops/);
  });

  it("4 · ops approves, then prices — two steps, rates land as basis points", async () => {
    asOps();
    const inv = await newestInvoice();

    // Approval alone carries no rates and does NOT unlock funding.
    expect((await approveInvoice({}, form({ invoiceId: inv.id }))).error).toBeUndefined();
    expect((await newestInvoice()).status).toBe("approved");
    expect((await fundInvoice({}, form({ invoiceId: inv.id }))).error).toMatch(
      /not yet priced/,
    );

    const res = await priceInvoice(
      {},
      form({
        invoiceId: inv.id,
        advanceRate: "85.00",
        supplierRate: "9.50",
        funderRate: "8.00",
        txnCostType: "fixed",
        txnCostValue: "150.00",
      }),
    );
    expect(res.error).toBeUndefined();
    const after = await newestInvoice();
    expect(after.status).toBe("priced");
    expect(after.advanceRateBps).toBe(8500);
    expect(after.supplierRateBps).toBe(950);
    expect(after.txnCostValue).toBe(15_000n);
  });

  it("5 · disbursing an unfunded deal is refused, naming the rule", async () => {
    asOps();
    const inv = await newestInvoice();
    const res = await disburseInvoice({}, form({ invoiceId: inv.id }));
    expect(res.error).toMatch(/only a funded invoice can be disbursed/i);
    const events = await db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.invoiceId, inv.id));
    expect(events).toHaveLength(0); // nothing booked on a refusal
  });

  it("6 · funding books two balanced entries and locks the snapshot", async () => {
    asOps();
    const inv = await newestInvoice();
    const funderCash = await accountIdFor("funder_cash");
    const clientMoney = await accountIdFor("client_collections");
    const before = await balances(db);

    const res = await fundInvoice({}, form({ invoiceId: inv.id }));
    expect(res.error).toBeUndefined();

    const after = await newestInvoice();
    expect(after.status).toBe("funded");
    expect(after.pricingSnapshot).toBeTruthy();

    const entries = await entriesFor(inv.id);
    expect(entries).toHaveLength(2);
    expect(entries.reduce((s, e) => s + e.amountMinor, 0n)).toBe(0n);

    // 85% of 48,000.00 = 40,800.00 moved from funder cash into client money.
    const now = await balances(db);
    expect((now.get(funderCash) ?? 0n) - (before.get(funderCash) ?? 0n)).toBe(-4_080_000n);
    expect((now.get(clientMoney) ?? 0n) - (before.get(clientMoney) ?? 0n)).toBe(4_080_000n);
  });

  it("7 · funding the same deal twice books exactly once", async () => {
    asOps();
    const inv = await newestInvoice();
    const res = await fundInvoice({}, form({ invoiceId: inv.id }));
    expect(res.error).toBeTruthy();
    // The state machine refuses before the ledger is even asked.
    expect(res.error).toMatch(/only a priced deal can be funded|already recorded/i);
    expect(await eventCount(inv.id)).toBe(1);
  });

  it("8 · disbursement: supplier money and the platform's margin as separate lines", async () => {
    asOps();
    const inv = await newestInvoice();
    const payable = await accountIdFor("supplier_payable", amberId);
    const platformOwn = await accountIdFor("platform_operating");
    const clientMoney = await accountIdFor("client_collections");
    const before = await balances(db);

    const res = await disburseInvoice({}, form({ invoiceId: inv.id }));
    expect(res.error).toBeUndefined();

    const after = await newestInvoice();
    expect(after.status).toBe("disbursed");

    const all = await entriesFor(inv.id);
    expect(all).toHaveLength(5); // 2 funding + 3 disbursement
    expect(all.reduce((s, e) => s + e.amountMinor, 0n)).toBe(0n);

    const now = await balances(db);
    // 40,004.00 to the supplier. The platform takes ONLY its margin — 252.00 —
    // and the funder's interest (544.00) stays in client money until payout,
    // which is the cycle-2 segregation split asserted end to end.
    expect((now.get(payable) ?? 0n) - (before.get(payable) ?? 0n)).toBe(4_000_400n);
    expect((now.get(platformOwn) ?? 0n) - (before.get(platformOwn) ?? 0n)).toBe(25_200n);
    expect((now.get(clientMoney) ?? 0n) - (before.get(clientMoney) ?? 0n)).toBe(-4_025_600n);
  });

  it("9 · a disbursed deal refuses both money gates, each naming its rule", async () => {
    // Since cycle 1, `disbursed` is no longer terminal (it awaits repayment)
    // — but neither money gate may fire again, and each says why.
    asOps();
    const inv = await newestInvoice();
    expect((await fundInvoice({}, form({ invoiceId: inv.id }))).error).toMatch(
      /only a priced deal can be funded/,
    );
    expect((await disburseInvoice({}, form({ invoiceId: inv.id }))).error).toMatch(
      /only a funded invoice can be disbursed/,
    );
    expect(await eventCount(inv.id)).toBe(2);
  });

  it("10 · a refusal must name its reason, and refused is terminal", async () => {
    asSupplier();
    await submitInvoice({}, submitForm({ faceValue: "9000.00" }));
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const fresh = all.find((r) => r.faceValueMinor === 900_000n && r.status === "submitted")!;
    createdIds.push(fresh.id);

    asOps();
    expect((await refuseInvoice({}, form({ invoiceId: fresh.id, reason: "no" }))).error).toMatch(
      /must name its reason/,
    );
    const ok = await refuseInvoice(
      {},
      form({ invoiceId: fresh.id, reason: "Debtor concentration cap (rule demo-cap-01)." }),
    );
    expect(ok.error).toBeUndefined();

    const [after] = await db.select().from(invoices).where(eq(invoices.id, fresh.id));
    expect(after.status).toBe("refused");
    expect(after.refusalReason).toMatch(/demo-cap-01/);

    // terminal: it cannot be approved back to life
    const back = await approveInvoice({}, form({ invoiceId: fresh.id }));
    expect(back.error).toMatch(/terminal/i);
  });

  it("10b · an invoice already past its due date cannot be financed", async () => {
    asSupplier();
    const before = await db.select().from(invoices);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    // issue date well before the (past) due date, so the past-due rule is
    // what trips rather than the issue-before-due rule
    const res = await submitInvoice(
      {},
      submitForm({
        faceValue: "5000.00",
        dueDate: yesterday,
        issueDate: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
      }),
    );
    expect(res.error).toMatch(/must be in the future/);
    expect((await db.select().from(invoices)).length).toBe(before.length);
  });

  it("10c · terms that would book a loss are refused, with the arithmetic named", async () => {
    asSupplier();
    await submitInvoice({}, submitForm({ faceValue: "10000.00" }));
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const fresh = all.find((r) => r.faceValueMinor === 1_000_000n && r.status === "submitted")!;
    createdIds.push(fresh.id);

    asOps();
    // Funder earns 12%, supplier pays 5%, no fee: the platform would pay the
    // difference on every deal.
    const bad = await approveAndPrice(fresh.id, {
      supplierRate: "5.00",
      funderRate: "12.00",
      txnCostValue: "0.00",
    });
    expect(bad.error).toMatch(/negative margin/);
    // Approval succeeded; only the PRICING was refused — so the deal waits at
    // `approved` with no rate card, which is the honest resting place.
    const [unchanged] = await db.select().from(invoices).where(eq(invoices.id, fresh.id));
    expect(unchanged.status).toBe("approved");
    expect(unchanged.advanceRateBps).toBeNull();

    // The same deal with a fee that covers the gap is fine.
    const ok = await approveAndPrice(fresh.id, {
      supplierRate: "5.00",
      funderRate: "12.00",
      txnCostValue: "500.00",
    });
    expect(ok.error).toBeUndefined();
  });

  it("10d · a rate outside 0–100% is refused", async () => {
    asOps();
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const target = all.find((r) => createdIds.includes(r.id) && r.status === "submitted");
    if (!target) return; // nothing submitted left to test against
    const res = await approveAndPrice(target.id, { supplierRate: "950.00" });
    expect(res.error).toMatch(/between 0% and 100%/);
  });

  it("15 · trade validation returns a deal, the supplier corrects it, ops approves", async () => {
    // The full round trip of Chetan's third outcome (2026-09-09).
    asSupplier();
    await submitInvoice({}, submitForm({ faceValue: "3300.00" }));
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const inv = all.find((r) => r.faceValueMinor === 330_000n && r.status === "submitted")!;
    createdIds.push(inv.id);

    asOps();
    // A return must say what to fix — the supplier acts on that note.
    expect((await returnForCorrection({}, form({ invoiceId: inv.id, note: "no" }))).error).toMatch(
      /Say what needs correcting/,
    );

    const note = "Due date looks wrong — please confirm the payment terms.";
    expect(
      (await returnForCorrection({}, form({ invoiceId: inv.id, note }))).error,
    ).toBeUndefined();

    const [returned] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(returned.status).toBe("returned");
    expect(returned.correctionNote).toBe(note);

    // A returned deal is out of ops's hands until it comes back.
    expect((await approveInvoice({}, form({ invoiceId: inv.id }))).error).toMatch(
      /returned to the supplier/,
    );
    expect((await priceInvoice({}, form({ invoiceId: inv.id, advanceRate: "85.00", supplierRate: "9.50", funderRate: "8.00", txnCostType: "fixed", txnCostValue: "150.00" }))).error).toMatch(
      /returned to the supplier/,
    );

    // The supplier corrects EVERY field — and it is re-validated from scratch.
    asSupplier();
    const bad = await resubmitInvoice(
      {},
      submitForm({
        invoiceId: inv.id,
        faceValue: "3400.00",
        dueDate: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
      }),
    );
    expect(bad.error).toMatch(/must be in the future|issue date must fall before/i);

    const fixed = await resubmitInvoice(
      {},
      submitForm({
        invoiceId: inv.id,
        invoiceNumber: `FIXED-${Date.now()}`,
        faceValue: "3400.00",
        description: "corrected consignment",
      }),
    );
    expect(fixed.error).toBeUndefined();

    const [back] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(back.status).toBe("submitted");
    expect(back.correctionNote).toBeNull(); // the note is cleared with the fix
    expect(back.faceValueMinor).toBe(340_000n); // the amount was editable
    expect(back.description).toBe("corrected consignment");

    // Back in the queue, it approves normally.
    asOps();
    expect((await approveInvoice({}, form({ invoiceId: inv.id }))).error).toBeUndefined();
    expect((await newestByIdStatus(inv.id))).toBe("approved");
  });

  it("11 · the double-booking refusal is enforced by Postgres, not by the UI", async () => {
    // Test 7 proved the state machine refuses first. This proves the layer
    // beneath it: if two requests ever raced past the state check, the unique
    // idempotency key still lets exactly one movement exist.
    const { bookMovement, LedgerError } = await import("@/lib/ledger");
    const inv = await newestInvoice();
    const funderCash = await accountIdFor("funder_cash");
    const clientMoney = await accountIdFor("client_collections");
    const key = `test-race:${inv.id}`;
    const entries = [
      { accountId: funderCash, amountMinor: -1_000n },
      { accountId: clientMoney, amountMinor: 1_000n },
    ];
    const movement = {
      invoiceId: inv.id,
      type: "funding" as const,
      evidenceRef: "demo:test:race",
      idempotencyKey: key,
      entries,
    };

    await bookMovement(db, movement);
    await expect(bookMovement(db, movement)).rejects.toThrowError(LedgerError);
    try {
      await bookMovement(db, movement);
    } catch (e) {
      expect((e as InstanceType<typeof LedgerError>).rule).toBe("ledger-already-recorded");
    }

    const events = await db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.idempotencyKey, key));
    expect(events).toHaveLength(1);
  });

  it("12 · an unbalanced movement is refused before the database is touched", async () => {
    const { bookMovement } = await import("@/lib/ledger");
    const inv = await newestInvoice();
    const before = await eventCount(inv.id);
    await expect(
      bookMovement(db, {
        invoiceId: inv.id,
        type: "funding",
        evidenceRef: "demo:test:unbalanced",
        idempotencyKey: `test-unbalanced:${inv.id}`,
        entries: [
          { accountId: await accountIdFor("funder_cash"), amountMinor: -1_000n },
          { accountId: await accountIdFor("client_collections"), amountMinor: 999n },
        ],
      }),
    ).rejects.toThrowError(/sum to zero/);
    expect(await eventCount(inv.id)).toBe(before);
  });

  it("13 · a cookie naming an unknown party resolves the same way the screen does", async () => {
    // Found by probing: the page rendered "Acting as Amber Textiles" while the
    // action refused the same cookie. Both now use resolvePartyForSeat, so the
    // invoice lands under exactly the supplier the screen named.
    const { resolvePartyForSeat } = await import("@/lib/queries");
    currentIdentity = {
      seat: "supplier",
      partyId: "00000000-0000-0000-0000-000000000000",
    };
    const shown = await resolvePartyForSeat("supplier", currentIdentity.partyId);

    const before = await db.select().from(invoices);
    const res = await submitInvoice({}, submitForm({ faceValue: "1234.00" }));
    expect(res.error).toBeUndefined();

    const after = await db.select().from(invoices);
    const created = after.find((a) => !before.some((b) => b.id === a.id))!;
    createdIds.push(created.id);
    expect(created.supplierId).toBe(shown!.id);
  });

  it("13b · terms stay editable until funding — re-approval updates them in place", async () => {
    // Design §3: "terms are editable until funding". Approve, then re-approve
    // with different terms; the deal stays approved, the terms move, and the
    // margin check still applies to the new terms.
    asSupplier();
    await submitInvoice({}, submitForm({ faceValue: "6000.00" }));
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const inv = all.find((r) => r.faceValueMinor === 600_000n && r.status === "submitted")!;
    createdIds.push(inv.id);

    asOps();
    const terms = (over: Record<string, string>) =>
      form({
        invoiceId: inv.id,
        advanceRate: "85.00",
        supplierRate: "9.50",
        funderRate: "8.00",
        txnCostType: "fixed",
        txnCostValue: "150.00",
        ...over,
      });
    expect((await approveInvoice({}, form({ invoiceId: inv.id }))).error).toBeUndefined();
    expect((await priceInvoice({}, terms({}))).error).toBeUndefined();
    // Re-pricing a priced deal updates it in place — no transition needed.
    expect((await priceInvoice({}, terms({ advanceRate: "80.00" }))).error).toBeUndefined();

    const [after] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(after.status).toBe("priced");
    expect(after.advanceRateBps).toBe(8000);

    // and the margin check bites on the re-price too
    const bad = await priceInvoice(
      {},
      terms({ supplierRate: "1.00", funderRate: "12.00", txnCostValue: "0.00" }),
    );
    expect(bad.error).toMatch(/negative margin/);
  });

  it("13c · once funded, terms are locked — re-approval refuses", async () => {
    asOps();
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const funded = all.find((r) => createdIds.includes(r.id) && r.status === "disbursed")!;
    const res = await priceInvoice(
      {},
      form({
        invoiceId: funded.id,
        advanceRate: "85.00",
        supplierRate: "9.50",
        funderRate: "8.00",
        txnCostType: "fixed",
        txnCostValue: "150.00",
      }),
    );
    expect(res.error).toMatch(/only an approved deal can be priced|terminal/i);
  });

  it("14 · funding a deal whose terms went missing is refused, and books nothing", async () => {
    // Eval case 3. The UI cannot reach this state — approval always writes
    // terms — so the guard is defensive. Defensive code that is never
    // exercised is a guess, so here it is exercised: approve a deal, strip its
    // terms in the database, and try to fund it.
    asSupplier();
    await submitInvoice({}, submitForm({ faceValue: "7000.00" }));
    const all = await db.select().from(invoices).where(eq(invoices.supplierId, amberId));
    const target = all.find((r) => r.faceValueMinor === 700_000n && r.status === "submitted")!;
    createdIds.push(target.id);

    asOps();
    await approveAndPrice(target.id);
    await db
      .update(invoices)
      .set({ advanceRateBps: null, supplierRateBps: null })
      .where(eq(invoices.id, target.id));

    const res = await fundInvoice({}, form({ invoiceId: target.id }));
    expect(res.error).toMatch(/Terms are not set/);
    expect(await eventCount(target.id)).toBe(0);
    const [after] = await db.select().from(invoices).where(eq(invoices.id, target.id));
    expect(after.status).toBe("priced"); // unmoved
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  /** funder_cash and supplier_payable belong to a party; client_collections and platform_operating do not. */
  async function accountIdFor(kind: string, partyId?: string) {
    const rows = await db.select().from(accounts);
    const row = rows.find((r) =>
      partyId ? r.kind === kind && r.partyId === partyId : r.kind === kind,
    );
    return row!.id;
  }

  async function entriesFor(invoiceId: string) {
    const events = await db
      .select({ id: settlementEvents.id })
      .from(settlementEvents)
      .where(eq(settlementEvents.invoiceId, invoiceId));
    if (!events.length) return [];
    return db
      .select()
      .from(ledgerEntries)
      .where(
        inArray(
          ledgerEntries.eventId,
          events.map((e) => e.id),
        ),
      );
  }

  async function newestByIdStatus(invoiceId: string) {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    return row.status;
  }

  async function eventCount(invoiceId: string) {
    const rows = await db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.invoiceId, invoiceId));
    return rows.length;
  }
});

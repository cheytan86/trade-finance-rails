import { describe, it, expect } from "vitest";
import { validateEntries, bookMovement, LedgerError, type MovementInput } from "./index";
import type { Db } from "@/db/client";

const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "aaaaaaaa-0000-0000-0000-000000000002";
const C = "aaaaaaaa-0000-0000-0000-000000000003";

describe("validateEntries — the invariant, proved by refusal", () => {
  it("accepts a balanced pair and a balanced three-way", () => {
    expect(() =>
      validateEntries([
        { accountId: A, amountMinor: -4_080_000n },
        { accountId: B, amountMinor: 4_080_000n },
      ]),
    ).not.toThrow();
    expect(() =>
      validateEntries([
        { accountId: A, amountMinor: -4_080_000n },
        { accountId: B, amountMinor: 4_000_400n },
        { accountId: C, amountMinor: 79_600n },
      ]),
    ).not.toThrow();
  });
  it("refuses an unbalanced movement, naming the rule and the drift", () => {
    try {
      validateEntries([
        { accountId: A, amountMinor: -100n },
        { accountId: B, amountMinor: 99n },
      ]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerError);
      expect((e as LedgerError).rule).toBe("ledger-balanced");
      expect((e as LedgerError).message).toContain("-1");
    }
  });
  it("refuses a single entry, a zero entry, and a non-bigint amount", () => {
    expect(() => validateEntries([{ accountId: A, amountMinor: 5n }])).toThrowError(
      /at least two/,
    );
    expect(() =>
      validateEntries([
        { accountId: A, amountMinor: 0n },
        { accountId: B, amountMinor: 0n },
      ]),
    ).toThrowError(/zero entry/);
    expect(() =>
      validateEntries([
        { accountId: A, amountMinor: -100 as unknown as bigint },
        { accountId: B, amountMinor: 100n },
      ]),
    ).toThrowError(/bigint/);
  });
});

// A fake Db that records whether it was ever touched — proving invalid
// movements are refused BEFORE any database call, and translating the
// Postgres unique-violation into the named idempotency refusal.
function fakeDb(opts: { failWith?: unknown } = {}) {
  const calls: string[] = [];
  const db = {
    insert: () => ({ values: () => "query" }),
    batch: async () => {
      calls.push("batch");
      if (opts.failWith) throw opts.failWith;
    },
  } as unknown as Db;
  return { db, calls };
}

const movement = (entries: MovementInput["entries"]): MovementInput => ({
  invoiceId: "inv-1",
  type: "funding",
  evidenceRef: "demo:test",
  idempotencyKey: "fund:inv-1",
  entries,
});

describe("bookMovement", () => {
  it("refuses an unbalanced movement before touching the database", async () => {
    const { db, calls } = fakeDb();
    await expect(
      bookMovement(db, movement([
        { accountId: A, amountMinor: -100n },
        { accountId: B, amountMinor: 50n },
      ])),
    ).rejects.toThrowError(LedgerError);
    expect(calls).toHaveLength(0);
  });
  it("books a balanced movement in one batch", async () => {
    const { db, calls } = fakeDb();
    const { eventId } = await bookMovement(db, movement([
      { accountId: A, amountMinor: -100n },
      { accountId: B, amountMinor: 100n },
    ]));
    expect(calls).toEqual(["batch"]);
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("translates a unique violation into ledger-already-recorded", async () => {
    const { db } = fakeDb({ failWith: Object.assign(new Error("x"), { code: "23505" }) });
    try {
      await bookMovement(db, movement([
        { accountId: A, amountMinor: -100n },
        { accountId: B, amountMinor: 100n },
      ]));
      expect.unreachable();
    } catch (e) {
      expect((e as LedgerError).rule).toBe("ledger-already-recorded");
    }
  });
});

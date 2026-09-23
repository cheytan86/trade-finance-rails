// The fixtures are the world every later prompt reasons about, so they are
// pinned here: if one drifts, a later eval would quietly stop testing what its
// name claims.

import { describe, expect, it } from "vitest";
import {
  ALL_PAYMENTS,
  ALL_LEGS,
  OPEN_LEGS,
  AMBIGUOUS_SENDER,
  EVAL_SETUP,
  FAILED_PAYMENT,
  LEG_ALREADY_SETTLED,
  NO_SENDER,
  ORPHAN_50K,
  PART_PAYMENT_FIRST,
  PART_PAYMENT_SECOND,
  SPENT_100,
  STILL_PENDING,
  UNATTRIBUTED_100,
  LEG_AWAITING_100,
  LEG_TAKING_PART_PAYMENTS,
} from "./index.ts";

describe("inbound payment fixtures", () => {
  it("every payment carries a unique rail reference", () => {
    const refs = ALL_PAYMENTS.map((p) => p.reference);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it("amounts are bigint minor units, never floats", () => {
    for (const p of ALL_PAYMENTS) {
      expect(typeof p.amountMinor).toBe("bigint");
    }
    expect(UNATTRIBUTED_100.amountMinor).toBe(10_000n);
    expect(ORPHAN_50K.amountMinor).toBe(5_000_000n);
    expect(PART_PAYMENT_FIRST.amountMinor).toBe(20_000n);
    expect(PART_PAYMENT_SECOND.amountMinor).toBe(12_000n);
  });

  it("renders newest first — the order the queue uses", () => {
    const times = ALL_PAYMENTS.map((p) => p.arrivedAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("a payment with no sender is still a payment", () => {
    // The sender is context for a person, never a precondition.
    expect(NO_SENDER.sender).toBeUndefined();
    expect(NO_SENDER.status).toBe("complete");
  });

  it("carries the non-complete states a screen has to survive", () => {
    expect(STILL_PENDING.status).toBe("pending");
    expect(FAILED_PAYMENT.status).toBe("failed");
  });
});

describe("the ambiguity is real, not invented", () => {
  it("two payments share an amount, a sender and a window", () => {
    const [a, b] = AMBIGUOUS_SENDER;
    expect(a.amountMinor).toBe(b.amountMinor);
    expect(a.sender?.id).toBe(b.sender?.id);
    // Under an hour apart — inside any plausible matching window.
    const gapMs = Math.abs(a.arrivedAt.getTime() - b.arrivedAt.getTime());
    expect(gapMs).toBeLessThan(60 * 60 * 1000);
    // And they are genuinely different payments.
    expect(a.reference).not.toBe(b.reference);
  });

  it("two open legs want the same amount", () => {
    const hundreds = OPEN_LEGS.filter((l) => l.amountMinor === 10_000n);
    expect(hundreds).toHaveLength(2);
    expect(hundreds[0].invoiceId).not.toBe(hundreds[1].invoiceId);
  });
});

describe("open legs", () => {
  it("offers only legs that could actually take money", () => {
    for (const l of OPEN_LEGS) {
      expect(["initiating", "initiated"]).toContain(l.status);
    }
    // Settled and failed legs exist in the world to be REFUSED, not offered.
    expect(OPEN_LEGS).not.toContain(LEG_ALREADY_SETTLED);
    expect(ALL_LEGS.length).toBeGreaterThan(OPEN_LEGS.length);
  });

  it("frozen entries sum to zero, as the ledger requires", () => {
    for (const l of ALL_LEGS) {
      const rows = l.entries as Array<{ amountMinor: string }>;
      const sum = rows.reduce((acc, r) => acc + BigInt(r.amountMinor), 0n);
      expect(sum).toBe(0n);
    }
  });

  it("every open leg's idempotency key is the one the ledger already uses", () => {
    // This is exactly what FIX A has to replace: `${type}:${invoiceId}` is
    // unique, so one leg can take one movement and a part payment is refused
    // by Postgres before any code runs.
    for (const l of OPEN_LEGS) {
      expect(l.idempotencyKey).toBe(`${l.type}:${l.invoiceId}`);
    }
  });
});

describe("the five eval cases each have their material", () => {
  it("1 · positive — payment and leg agree exactly", () => {
    expect(EVAL_SETUP.positive.payment.amountMinor).toBe(
      EVAL_SETUP.positive.leg.amountMinor,
    );
    expect(EVAL_SETUP.positive.payment).toBe(UNATTRIBUTED_100);
    expect(EVAL_SETUP.positive.leg).toBe(LEG_AWAITING_100);
  });

  it("2 · part payment — the two parts sum to what the leg expects", () => {
    const [first, second] = EVAL_SETUP.partPayment.payments;
    expect(first.amountMinor + second.amountMinor).toBe(
      EVAL_SETUP.partPayment.leg.amountMinor,
    );
    expect(first.amountMinor).toBeLessThan(EVAL_SETUP.partPayment.leg.amountMinor);
  });

  it("3 · ambiguous — one payment, two equally good candidates", () => {
    const { payment, candidates } = EVAL_SETUP.ambiguous;
    expect(candidates).toHaveLength(2);
    for (const c of candidates) expect(c.amountMinor).toBe(payment.amountMinor);
  });

  it("4 · orphan — matches no open leg, and that is the pass", () => {
    const matches = OPEN_LEGS.filter(
      (l) => l.amountMinor === ORPHAN_50K.amountMinor,
    );
    expect(matches).toHaveLength(0);
    expect(EVAL_SETUP.orphan.candidates).toHaveLength(0);
  });

  it("the part-payment leg does NOT collide with the ambiguous pair", () => {
    // The bug this pins: an earlier draft put it at 100.00, which made three
    // open legs share an amount and turned case 3 into a three-way.
    expect(LEG_TAKING_PART_PAYMENTS.amountMinor).not.toBe(10_000n);
  });

  it("5 · refusals — a spent payment, a settled deal, an over-application", () => {
    expect(EVAL_SETUP.refusals.alreadySpent.payment).toBe(SPENT_100);
    expect(EVAL_SETUP.refusals.settledDeal.leg.status).toBe("settled");
    // 100.00 offered against a leg that will already hold 200.00 + 120.00.
    expect(EVAL_SETUP.refusals.overApplied.leg).toBe(LEG_TAKING_PART_PAYMENTS);
  });
});

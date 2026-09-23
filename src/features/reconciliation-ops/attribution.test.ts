// Every transition the design names — including the ones that must NOT be
// possible. The refusals get more tests than the happy path deliberately:
// epics A–D prove the feature works, epic E proves it cannot be made to lie,
// and only one of those two is load-bearing when someone is tired.

import { describe, expect, it } from "vitest";
import {
  attributableAmount,
  attributedOf,
  outstandingOn,
  paymentState,
  refuseAttribution,
  remainderAfter,
  unattributedOf,
  type AttributionFacts,
} from "./attribution.ts";
import {
  FAILED_PAYMENT,
  LEG_ALREADY_SETTLED,
  LEG_AWAITING_100,
  LEG_GENUINELY_FAILED,
  LEG_TAKING_PART_PAYMENTS,
  ORPHAN_50K,
  PART_PAYMENT_FIRST,
  STILL_PENDING,
  UNATTRIBUTED_100,
} from "./fixtures/index.ts";

const NOTHING: never[] = [];

function facts(over: Partial<AttributionFacts> = {}): AttributionFacts {
  return {
    payment: UNATTRIBUTED_100,
    bookedAgainstPayment: NOTHING,
    leg: LEG_AWAITING_100,
    bookedAgainstLeg: NOTHING,
    ...over,
  };
}

describe("derived state — nothing is stored", () => {
  it("a payment nobody has touched is unattributed", () => {
    expect(paymentState(UNATTRIBUTED_100, NOTHING)).toBe("unattributed");
    expect(unattributedOf(UNATTRIBUTED_100, NOTHING)).toBe(10_000n);
    expect(attributedOf(NOTHING)).toBe(0n);
  });

  it("a payment partly booked is part-attributed", () => {
    const booked = [{ amountMinor: 4_000n }];
    expect(paymentState(UNATTRIBUTED_100, booked)).toBe("part-attributed");
    expect(unattributedOf(UNATTRIBUTED_100, booked)).toBe(6_000n);
  });

  it("a payment fully booked is attributed", () => {
    const booked = [{ amountMinor: 6_000n }, { amountMinor: 4_000n }];
    expect(paymentState(UNATTRIBUTED_100, booked)).toBe("attributed");
    expect(unattributedOf(UNATTRIBUTED_100, booked)).toBe(0n);
  });

  it("never reports a negative remainder, whatever the movements say", () => {
    // Defensive: if the ledger somehow holds more than the payment, the answer
    // is "nothing left", not a negative number that would render as a credit.
    expect(unattributedOf(UNATTRIBUTED_100, [{ amountMinor: 99_999n }])).toBe(0n);
    expect(outstandingOn(LEG_AWAITING_100, [{ amountMinor: 99_999n }])).toBe(0n);
  });

  it("a leg's outstanding falls as movements book against it", () => {
    expect(outstandingOn(LEG_TAKING_PART_PAYMENTS, NOTHING)).toBe(32_000n);
    expect(outstandingOn(LEG_TAKING_PART_PAYMENTS, [{ amountMinor: 20_000n }])).toBe(12_000n);
    expect(
      outstandingOn(LEG_TAKING_PART_PAYMENTS, [
        { amountMinor: 20_000n },
        { amountMinor: 12_000n },
      ]),
    ).toBe(0n);
  });
});

describe("what a full attribution would move", () => {
  it("takes the smaller of what is free and what is owed", () => {
    // A payment bigger than the leg: the leg's outstanding caps it.
    expect(
      attributableAmount(facts({ payment: ORPHAN_50K, leg: LEG_AWAITING_100 })),
    ).toBe(10_000n);
    // A payment smaller than the leg: the payment caps it — this IS a part
    // payment, and it falls out rather than being a separate mode.
    expect(
      attributableAmount(
        facts({ payment: PART_PAYMENT_FIRST, leg: LEG_TAKING_PART_PAYMENTS }),
      ),
    ).toBe(20_000n);
  });

  it("names the remainder that would land in unapplied", () => {
    const f = facts({ payment: ORPHAN_50K, leg: LEG_AWAITING_100 });
    expect(remainderAfter(f, 10_000n)).toBe(4_990_000n);
    // A payment fully consumed leaves nothing behind.
    expect(remainderAfter(facts(), 10_000n)).toBe(0n);
  });
});

describe("E1 — one payment is spent exactly once", () => {
  it("refuses a payment with nothing left", () => {
    const r = refuseAttribution(
      facts({ bookedAgainstPayment: [{ amountMinor: 10_000n }] }),
      10_000n,
    );
    expect(r?.rule).toBe("attribution-payment-spent");
    expect(r?.message).toMatch(/once/i);
  });

  it("refuses more than the payment has left, and says how much that is", () => {
    const r = refuseAttribution(
      facts({ bookedAgainstPayment: [{ amountMinor: 6_000n }] }),
      10_000n,
    );
    expect(r?.rule).toBe("attribution-exceeds-payment");
    expect(r?.message).toContain("40.00");
  });

  it("allows exactly what is left", () => {
    expect(
      refuseAttribution(
        facts({ bookedAgainstPayment: [{ amountMinor: 6_000n }] }),
        4_000n,
      ),
    ).toBeNull();
  });
});

describe("E2 — never more than what is outstanding", () => {
  it("a leg expecting 320 with 200 booked accepts 120 and refuses 130", () => {
    const f = facts({
      payment: ORPHAN_50K,
      leg: LEG_TAKING_PART_PAYMENTS,
      bookedAgainstLeg: [{ amountMinor: 20_000n }],
    });
    expect(refuseAttribution(f, 12_000n)).toBeNull();
    const r = refuseAttribution(f, 13_000n);
    expect(r?.rule).toBe("attribution-exceeds-outstanding");
    expect(r?.message).toContain("120.00");
  });

  it("refuses a leg already covered by booked movements", () => {
    const r = refuseAttribution(
      facts({
        payment: ORPHAN_50K,
        leg: LEG_TAKING_PART_PAYMENTS,
        bookedAgainstLeg: [{ amountMinor: 32_000n }],
      }),
      100n,
    );
    expect(r?.rule).toBe("attribution-leg-covered");
  });
});

describe("E3 — nothing is attributed to a closed leg", () => {
  it("refuses a settled leg with a reason ops can act on", () => {
    const r = refuseAttribution(facts({ leg: LEG_ALREADY_SETTLED }), 100n);
    expect(r?.rule).toBe("attribution-leg-settled");
    expect(r?.message).toMatch(/nothing left/i);
  });

  it("refuses a failed leg rather than resurrecting it", () => {
    const r = refuseAttribution(facts({ leg: LEG_GENUINELY_FAILED }), 100n);
    expect(r?.rule).toBe("attribution-leg-failed");
  });
});

describe("the rail's own view of the money is respected", () => {
  it("a payment the rail has not confirmed cannot be attributed", () => {
    const r = refuseAttribution(facts({ payment: STILL_PENDING }), 100n);
    expect(r?.rule).toBe("attribution-payment-not-complete");
    // "Not yet" is not "no" — the message has to say so, or ops deletes it.
    expect(r?.message).toMatch(/not confirmed|will become/i);
  });

  it("a payment the rail says failed is not money", () => {
    const r = refuseAttribution(facts({ payment: FAILED_PAYMENT }), 100n);
    expect(r?.rule).toBe("attribution-payment-not-complete");
    expect(r?.message).toMatch(/failed/i);
  });

  it("refuses a cross-currency attribution rather than converting", () => {
    const r = refuseAttribution(facts({ legCurrency: "EUR" }), 100n);
    expect(r?.rule).toBe("attribution-wrong-currency");
    expect(r?.message).toMatch(/does not convert/i);
  });
});

describe("the arithmetic itself", () => {
  it("refuses zero and negative amounts", () => {
    expect(refuseAttribution(facts(), 0n)?.rule).toBe("attribution-nonpositive");
    expect(refuseAttribution(facts(), -1n)?.rule).toBe("attribution-nonpositive");
  });

  it("permits the exact-match happy path", () => {
    expect(refuseAttribution(facts(), 10_000n)).toBeNull();
  });

  it("checks the payment BEFORE the leg, so the message names the real blocker", () => {
    // Both are wrong here. The payment being spent is the fact ops has to act
    // on; being told about the settled leg would send them looking in the
    // wrong place.
    const r = refuseAttribution(
      facts({
        bookedAgainstPayment: [{ amountMinor: 10_000n }],
        leg: LEG_ALREADY_SETTLED,
      }),
      100n,
    );
    expect(r?.rule).toBe("attribution-payment-spent");
  });
});

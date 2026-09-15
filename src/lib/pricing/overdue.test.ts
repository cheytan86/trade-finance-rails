import { describe, it, expect } from "vitest";
import { computeOverdue, daysLateBetween, OVERDUE_PREMIUM_BPS } from "./overdue";
import { MoneyError } from "../money/index.ts";

describe("Chetan's worked example, to the cent", () => {
  // Principal 8,000.00 · supplier 8% → 10% · funder 7% → 9% · 10 days late.
  // Charged 22.22 · funder 20.00 · platform 2.22.
  const result = computeOverdue({
    principalMinor: 800_000n,
    supplierRateBps: 800,
    funderRateBps: 700,
    daysLate: 10,
    residualMinor: 200_000n, // 2,000.00 residual — well above the charge
  });

  it("charges the supplier 22.22", () => expect(result.supplierChargeMinor).toBe(2_222n));
  it("pays the funder 20.00", () => expect(result.funderShareMinor).toBe(2_000n));
  it("leaves the platform 2.22", () => expect(result.platformShareMinor).toBe(222n));
  it("does not cap", () => expect(result.capped).toBe(false));

  it("the three reconcile exactly — the platform share IS the difference", () => {
    expect(result.supplierChargeMinor - result.funderShareMinor).toBe(result.platformShareMinor);
  });

  it("the premium is 2% on both sides", () => expect(OVERDUE_PREMIUM_BPS).toBe(200));

  it("the platform's share depends only on the SPREAD — the two +2%s cancel", () => {
    // Same 1% spread, rates shifted wholesale: the platform earns the same.
    const shifted = computeOverdue({
      principalMinor: 800_000n,
      supplierRateBps: 1500,
      funderRateBps: 1400,
      daysLate: 10,
      residualMinor: 200_000n,
    });
    expect(shifted.platformShareMinor).toBe(result.platformShareMinor); // 2.22
    // …while both parties' own accruals do move with their rates.
    expect(shifted.supplierChargeMinor).toBeGreaterThan(result.supplierChargeMinor);
  });
});

describe("on time", () => {
  it("accrues nothing at zero days late", () => {
    const r = computeOverdue({
      principalMinor: 800_000n,
      supplierRateBps: 800,
      funderRateBps: 700,
      daysLate: 0,
      residualMinor: 200_000n,
    });
    expect(r).toMatchObject({
      supplierChargeMinor: 0n,
      funderShareMinor: 0n,
      platformShareMinor: 0n,
      capped: false,
    });
  });
});

describe("the residual cap — a supplier never owes more than they were due", () => {
  const capped = computeOverdue({
    principalMinor: 800_000n,
    supplierRateBps: 800,
    funderRateBps: 700,
    daysLate: 999, // absurdly late
    residualMinor: 5_000n, // only 50.00 of residual exists
  });

  it("charges exactly the residual, never more", () => {
    expect(capped.supplierChargeMinor).toBe(5_000n);
    expect(capped.capped).toBe(true);
  });
  it("the funder is paid first from what exists; the platform takes the remainder", () => {
    expect(capped.funderShareMinor).toBe(5_000n); // funder accrual exceeds the cap
    expect(capped.platformShareMinor).toBe(0n);
    expect(capped.funderShareMinor + capped.platformShareMinor).toBe(capped.supplierChargeMinor);
  });
  it("a zero residual charges nothing at all", () => {
    const none = computeOverdue({
      principalMinor: 800_000n,
      supplierRateBps: 800,
      funderRateBps: 700,
      daysLate: 30,
      residualMinor: 0n,
    });
    expect(none.supplierChargeMinor).toBe(0n);
    expect(none.capped).toBe(true);
  });
});

describe("refusals", () => {
  it("refuses negative days", () => {
    expect(() =>
      computeOverdue({
        principalMinor: 800_000n,
        supplierRateBps: 800,
        funderRateBps: 700,
        daysLate: -1,
        residualMinor: 200_000n,
      }),
    ).toThrowError(MoneyError);
  });
  it("refuses an inverted spread — overdue must never be a platform loss", () => {
    expect(() =>
      computeOverdue({
        principalMinor: 800_000n,
        supplierRateBps: 700,
        funderRateBps: 800,
        daysLate: 10,
        residualMinor: 200_000n,
      }),
    ).toThrowError(/platform loss/);
  });
});

describe("daysLateBetween", () => {
  it("counts whole days past the due date, UTC-truncated", () => {
    expect(daysLateBetween("2026-09-01", new Date("2026-09-11T23:30:00Z"))).toBe(10);
    expect(daysLateBetween("2026-09-01", new Date("2026-09-01T23:59:59Z"))).toBe(0);
  });
  it("is zero for an early payment — never negative", () => {
    expect(daysLateBetween("2026-12-01", new Date("2026-09-08T00:00:00Z"))).toBe(0);
  });
});

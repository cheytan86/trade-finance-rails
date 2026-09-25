import { describe, it, expect } from "vitest";
import { computeIndicators, formatBps } from "./indicators";
import { computePricing, type PricingTerms } from "./index";

// The pinned worked example: 48,000.00 face · 85% advance · 9.50% supplier ·
// 8.00% funder · 150.00 fixed cost · 60 days.
const TERMS: PricingTerms = {
  faceValueMinor: 4_800_000n,
  dueDate: "2026-11-05",
  advanceRateBps: 8500,
  supplierRateBps: 950,
  funderRateBps: 800,
  txnCostType: "fixed",
  txnCostValue: 15_000n,
};
const b = computePricing(TERMS, new Date("2026-09-06T00:00:00Z"));
const ind = computeIndicators(b, TERMS.faceValueMinor);

describe("supplier all-in cost — the number a supplier compares to their bank", () => {
  it("is fees over what they actually receive", () => {
    // 646.00 interest + 150.00 cost = 796.00 on 40,004.00 received = 1.99%
    expect(ind.supplierAllInBps).toBe(199);
    expect(formatBps(ind.supplierAllInBps)).toBe("1.99%");
  });
  it("annualises over the tenor, on a calendar-day basis", () => {
    // 796.00 / 40,004.00 over 60 days → ×365/60 = 12.10% p.a., rounded ONCE
    // from the raw ratio (annualising the rounded 1.99% would drift to 12.11%)
    expect(ind.supplierAllInAnnualisedBps).toBe(1210);
    expect(formatBps(ind.supplierAllInAnnualisedBps)).toBe("12.10%");
  });
});

describe("funder yield", () => {
  it("is the return over the cash the funder put in, annualised", () => {
    // 544.00 on 40,256.00 = 1.35% for 60 days → ~8.22% p.a.
    expect(ind.funderYieldAnnualisedBps).toBe(822);
  });
});

describe("platform margin", () => {
  it("carries the cash amount unchanged from the breakdown", () => {
    expect(ind.platformMarginMinor).toBe(25_200n); // 252.00
    expect(ind.platformMarginMinor).toBe(b.platformMarginMinor);
  });
  it("expresses it as basis points of face value", () => {
    // 252.00 / 48,000.00 = 0.525% = 52.5bps
    expect(ind.platformMarginBpsOfFace).toBe(53); // rounded to whole bps
  });
});

describe("honesty at the edges", () => {
  it("refuses to annualise a zero tenor rather than dividing by zero", () => {
    const past = computePricing(TERMS, new Date("2026-12-01T00:00:00Z"));
    const i = computeIndicators(past, TERMS.faceValueMinor);
    expect(past.tenorDays).toBe(0);
    expect(i.annualisable).toBe(false);
    expect(i.supplierAllInAnnualisedBps).toBe(0);
    expect(i.funderYieldAnnualisedBps).toBe(0);
  });

  it("returns zero rather than a bogus ratio when a denominator is zero", () => {
    const i = computeIndicators({ ...b, supplierDisbursementMinor: 0n }, 0n);
    expect(i.supplierAllInBps).toBe(0);
    expect(i.platformMarginBpsOfFace).toBe(0);
  });

  it("the supplier's cost exceeds the funder's yield — the platform's spread", () => {
    expect(ind.supplierAllInAnnualisedBps).toBeGreaterThan(ind.funderYieldAnnualisedBps);
  });
});

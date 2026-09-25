import { describe, it, expect } from "vitest";
import { computePricing, tenorDaysBetween, snapshotToJson, parseSnapshot, type PricingTerms } from "./index";

// The design file's worked terms (design.md §4/§5): face 48,000.00 · 85% ·
// 9.50% supplier · 8.00% funder · 150.00 fixed cost · 60 days.
const TERMS: PricingTerms = {
  faceValueMinor: 4_800_000n,
  dueDate: "2026-11-05",
  advanceRateBps: 8500,
  supplierRateBps: 950,
  funderRateBps: 800,
  txnCostType: "fixed",
  txnCostValue: 15_000n,
};
const T0 = new Date("2026-09-06T00:00:00Z"); // 60 days before due

describe("computePricing — the worked example, to the cent", () => {
  const b = computePricing(TERMS, T0);
  it("tenor is 60 days act/360", () => expect(b.tenorDays).toBe(60));
  it("principal 40,800.00", () => expect(b.principalMinor).toBe(4_080_000n));
  it("supplier interest 646.00", () => expect(b.supplierInterestMinor).toBe(64_600n));
  it("disbursement 40,004.00", () => expect(b.supplierDisbursementMinor).toBe(4_000_400n));
  it("funder interest 544.00 → financing 40,256.00", () => {
    expect(b.funderInterestMinor).toBe(54_400n);
    expect(b.funderFinancingMinor).toBe(4_025_600n);
  });
  it("margin 252.00 — the margin identity holds", () => {
    expect(b.platformMarginMinor).toBe(25_200n);
    expect(b.funderFinancingMinor - b.supplierDisbursementMinor).toBe(b.platformMarginMinor);
  });
  it("residual 7,200.00, and disbursement + fees reassemble the principal", () => {
    expect(b.supplierResidualMinor).toBe(720_000n);
    expect(b.supplierDisbursementMinor + b.supplierInterestMinor + b.txnCostMinor).toBe(
      b.principalMinor,
    );
  });
});

describe("tenor behavior", () => {
  it("a later financing date shrinks the tenor — which is WHY the snapshot locks", () => {
    const later = computePricing(TERMS, new Date("2026-10-06T00:00:00Z"));
    expect(later.tenorDays).toBe(30);
    expect(later.supplierInterestMinor).toBe(32_300n); // half the interest
  });
  it("past-due clamps to zero, never negative", () => {
    const past = computePricing(TERMS, new Date("2026-12-01T00:00:00Z"));
    expect(past.tenorDays).toBe(0);
    expect(past.supplierInterestMinor).toBe(0n);
  });
  it("daysBetween truncates both ends to UTC midnight", () => {
    expect(tenorDaysBetween("2026-11-05", new Date("2026-09-06T23:59:59Z"))).toBe(60);
  });
});

describe("percent transaction cost", () => {
  it("50bps of principal", () => {
    const b = computePricing({ ...TERMS, txnCostType: "percent", txnCostValue: 50n }, T0);
    expect(b.txnCostMinor).toBe(20_400n); // 40,800.00 × 0.50%
  });
});

describe("snapshot lock — serialize, persist, parse, identical", () => {
  it("roundtrips through JSON with no drift", () => {
    const b = computePricing(TERMS, T0);
    const revived = parseSnapshot(JSON.parse(JSON.stringify(snapshotToJson(b))));
    expect(revived).toEqual(b);
  });
  it("refuses a corrupted snapshot, naming the field", () => {
    const j = snapshotToJson(computePricing(TERMS, T0)) as Record<string, unknown>;
    j.principalMinor = 40800.0; // a float smuggled into storage
    expect(() => parseSnapshot(j)).toThrowError(/principalMinor/);
  });
});

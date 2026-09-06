import { describe, it, expect } from "vitest";
import { fundingEntries, disbursementEntries } from "./preview";
import { computePricing, type PricingTerms } from "@/lib/pricing";
import { validateEntries } from "@/lib/ledger";

const TERMS: PricingTerms = {
  faceValueMinor: 4_800_000n,
  dueDate: "2026-11-05",
  advanceRateBps: 8500,
  supplierRateBps: 950,
  funderRateBps: 800,
  txnCostType: "fixed",
  txnCostValue: 15_000n,
};
const snap = computePricing(TERMS, new Date("2026-09-06T00:00:00Z"));

const ACC = {
  funderCash: { id: "acc-funder", label: "funder_cash · Northgate" },
  treasury: { id: "acc-treasury", label: "platform_treasury" },
  supplierPayable: { id: "acc-payable", label: "supplier_payable · Amber" },
  feeIncome: { id: "acc-fees", label: "fee_income" },
};

describe("what the gate shows is what the ledger will accept", () => {
  it("funding: two entries, principal out of funder cash into treasury, Σ=0", () => {
    const e = fundingEntries(snap, ACC);
    expect(e).toHaveLength(2);
    expect(e[0].amountMinor).toBe(-4_080_000n);
    expect(e[1].amountMinor).toBe(4_080_000n);
    expect(() => validateEntries(e)).not.toThrow();
  });

  it("disbursement: three entries — supplier money and fees as separate lines, Σ=0", () => {
    const e = disbursementEntries(snap, ACC);
    expect(e).toHaveLength(3);
    expect(e[0].amountMinor).toBe(-4_080_000n); // treasury
    expect(e[1].amountMinor).toBe(4_000_400n); // supplier payable
    expect(e[2].amountMinor).toBe(79_600n); // fees = interest 646.00 + cost 150.00
    expect(e[2].amountMinor).toBe(snap.supplierInterestMinor + snap.txnCostMinor);
    expect(() => validateEntries(e)).not.toThrow();
  });

  it("the whole spine nets to zero across both movements", () => {
    const all = [...fundingEntries(snap, ACC), ...disbursementEntries(snap, ACC)];
    expect(all.reduce((s, e) => s + e.amountMinor, 0n)).toBe(0n);
    // and the treasury ends flat: it is a conduit, not a beneficiary
    const treasury = all
      .filter((e) => e.accountId === "acc-treasury")
      .reduce((s, e) => s + e.amountMinor, 0n);
    expect(treasury).toBe(0n);
  });
});

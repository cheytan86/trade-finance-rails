import { describe, it, expect } from "vitest";
import {
  fundingEntries,
  disbursementEntries,
  repaymentEntries,
  payoutEntries,
  residualEntries,
} from "./preview";
import { computeOverdue } from "@/lib/pricing/overdue";
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
  debtorCash: { id: "acc-debtor", label: "debtor_cash · Meridian" },
};

const onTime = computeOverdue({
  principalMinor: snap.principalMinor,
  supplierRateBps: 950,
  funderRateBps: 800,
  daysLate: 0,
  residualMinor: snap.supplierResidualMinor,
});
const late10 = computeOverdue({
  principalMinor: snap.principalMinor,
  supplierRateBps: 950,
  funderRateBps: 800,
  daysLate: 10,
  residualMinor: snap.supplierResidualMinor,
});

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

describe("the back half — repayment, payout, residual", () => {
  const sum = (es: { amountMinor: bigint }[]) => es.reduce((s, e) => s + e.amountMinor, 0n);
  const by = (es: { accountId: string; amountMinor: bigint }[], id: string) =>
    es.filter((e) => e.accountId === id).reduce((s, e) => s + e.amountMinor, 0n);

  it("the debtor pays the face value exactly — early, on time, or late", () => {
    const r = repaymentEntries(TERMS.faceValueMinor, ACC);
    expect(sum(r)).toBe(0n);
    expect(by(r, "acc-debtor")).toBe(-4_800_000n);
    expect(by(r, "acc-treasury")).toBe(4_800_000n);
  });

  it("payout on time: funder gets principal + their agreed return", () => {
    const p = payoutEntries(snap, onTime, ACC);
    expect(sum(p)).toBe(0n);
    // 40,800.00 principal + 544.00 funder interest
    expect(by(p, "acc-funder")).toBe(4_080_000n + 54_400n);
    expect(by(p, "acc-fees")).toBe(-54_400n); // the return, released from fees
  });

  it("residual on time: the supplier gets the whole residual, no fee line", () => {
    const r = residualEntries(snap, onTime, ACC);
    expect(sum(r)).toBe(0n);
    expect(by(r, "acc-payable")).toBe(720_000n); // 7,200.00
    expect(r.some((e) => e.accountId === "acc-fees")).toBe(false);
  });

  it("ten days late: the residual shrinks by the charge, funder and platform take their shares", () => {
    // principal 40,800.00 · supplier 9.5%→11.5% · funder 8%→10% · 10 days
    expect(late10.supplierChargeMinor).toBe(13_033n); // 130.33
    expect(late10.funderShareMinor).toBe(11_333n); // 113.33
    expect(late10.platformShareMinor).toBe(1_700n); // 17.00

    const p = payoutEntries(snap, late10, ACC);
    const r = residualEntries(snap, late10, ACC);
    expect(sum(p)).toBe(0n);
    expect(sum(r)).toBe(0n);

    // funder: principal + return + overdue share
    expect(by(p, "acc-funder")).toBe(4_080_000n + 54_400n + 11_333n);
    // supplier: residual less the charge
    expect(by(r, "acc-payable")).toBe(720_000n - 13_033n);
    // platform keeps the spread
    expect(by(r, "acc-fees")).toBe(1_700n);
  });

  it("the full five-leg deal nets to zero and leaves the treasury flat", () => {
    const all = [
      ...fundingEntries(snap, ACC),
      ...disbursementEntries(snap, ACC),
      ...repaymentEntries(TERMS.faceValueMinor, ACC),
      ...payoutEntries(snap, late10, ACC),
      ...residualEntries(snap, late10, ACC),
    ];
    expect(sum(all)).toBe(0n);
    expect(by(all, "acc-treasury")).toBe(0n); // conduit, not beneficiary
    // and every party's net is exactly what the deal promised them
    expect(by(all, "acc-debtor")).toBe(-4_800_000n); // paid face
    expect(by(all, "acc-funder")).toBe(-4_080_000n + 4_080_000n + 54_400n + 11_333n); // return + overdue
    expect(by(all, "acc-payable")).toBe(4_000_400n + 720_000n - 13_033n); // disbursement + residual − charge
  });
});

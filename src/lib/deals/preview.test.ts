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
  clientCollections: { id: "acc-client", label: "client_collections" },
  supplierPayable: { id: "acc-payable", label: "supplier_payable · Amber" },
  platformOperating: { id: "acc-platform", label: "platform_operating" },
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
  it("funding: the funder pays in principal LESS their return — discounting, not lending", () => {
    const e = fundingEntries(snap, ACC);
    expect(e).toHaveLength(2);
    // 40,800.00 principal − 544.00 return = 40,256.00 actually handed over.
    // The return is never given to us and so can never be given back wrongly.
    expect(e[0].amountMinor).toBe(-4_025_600n);
    expect(e[1].amountMinor).toBe(4_025_600n);
    expect(-e[0].amountMinor).toBe(snap.principalMinor - snap.funderInterestMinor);
    expect(-e[0].amountMinor).toBe(snap.funderFinancingMinor);
    expect(() => validateEntries(e)).not.toThrow();
  });

  it("disbursement: the platform takes ONLY its margin, and client money empties exactly", () => {
    const e = disbursementEntries(snap, ACC);
    expect(e).toHaveLength(3);
    // cycle 2: client money gives up the supplier's payment plus the
    // platform's margin — NOT the whole principal, because the funder's
    // interest has not been earned by anyone yet.
    expect(e[0].amountMinor).toBe(-4_025_600n); // client_collections
    expect(e[1].amountMinor).toBe(4_000_400n); // supplier payable
    expect(e[2].amountMinor).toBe(25_200n); // platform margin ONLY
    expect(e[2].amountMinor).toBe(snap.platformMarginMinor);
    // and the decomposition that makes the split exact:
    //   fees = supplierInterest + txnCost = platformMargin + funderInterest
    expect(snap.supplierInterestMinor + snap.txnCostMinor).toBe(
      snap.platformMarginMinor + snap.funderInterestMinor,
    );
    expect(() => validateEntries(e)).not.toThrow();
  });

  it("after funding and disbursement, client money holds EXACTLY the funder's interest", () => {
    const all = [...fundingEntries(snap, ACC), ...disbursementEntries(snap, ACC)];
    expect(all.reduce((s, e) => s + e.amountMinor, 0n)).toBe(0n);
    // THE SEGREGATION CLAIM, asserted rather than intended, and STRONGER
    // under discounting (Chetan, 2026-09-18): the funder's return never
    // reaches us at all, so after the supplier is paid the conduit is EMPTY.
    // Cycle 1 swept the whole principal and parked the return in fee_income;
    // cycle 2 held it as client money; neither is needed if it never arrives.
    const clientMoney = all
      .filter((e) => e.accountId === "acc-client")
      .reduce((s, e) => s + e.amountMinor, 0n);
    expect(clientMoney).toBe(0n);

    const platformOwn = all
      .filter((e) => e.accountId === "acc-platform")
      .reduce((s, e) => s + e.amountMinor, 0n);
    expect(platformOwn).toBe(snap.platformMarginMinor);
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
    expect(by(r, "acc-client")).toBe(4_800_000n);
  });

  it("payout on time: the funder gets the PRINCIPAL back — the return was the discount", () => {
    const p = payoutEntries(snap, onTime, ACC);
    expect(sum(p)).toBe(0n);
    // 40,800.00 principal, and not a cent of interest: it was taken up front
    // as the discount, so paying it again here would pay it twice.
    expect(p).toHaveLength(2); // cycle 2: two accounts, not three
    expect(by(p, "acc-funder")).toBe(4_080_000n);
    expect(by(p, "acc-client")).toBe(-4_080_000n);
    expect(by(p, "acc-platform")).toBe(0n);
  });

  it("residual on time: the supplier gets the whole residual, no fee line", () => {
    const r = residualEntries(snap, onTime, ACC);
    expect(sum(r)).toBe(0n);
    expect(by(r, "acc-payable")).toBe(720_000n); // 7,200.00
    expect(r.some((e) => e.accountId === "acc-platform")).toBe(false);
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

    // funder: principal + the overdue share ONLY. Extra days cannot be
    // discounted up front, so that part is genuinely paid at payout.
    expect(by(p, "acc-funder")).toBe(4_080_000n + 11_333n);
    // supplier: residual less the charge
    expect(by(r, "acc-payable")).toBe(720_000n - 13_033n);
    // platform keeps the spread
    expect(by(r, "acc-platform")).toBe(1_700n);
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
    expect(by(all, "acc-client")).toBe(0n); // conduit, not beneficiary
    // and every party's net is exactly what the deal promised them
    expect(by(all, "acc-debtor")).toBe(-4_800_000n); // paid face
    expect(by(all, "acc-funder")).toBe(-4_025_600n + 4_080_000n + 11_333n); // return + overdue
    expect(by(all, "acc-payable")).toBe(4_000_400n + 720_000n - 13_033n); // disbursement + residual − charge
  });
});

// The entry shapes for cycle 0's two movements, as pure functions. The gate
// dialog renders exactly what these produce, and the action books exactly
// what these produce — one source, so the confirmation cannot drift from the
// consequence.

import type { PricingBreakdown } from "@/lib/pricing";
import type { OverdueBreakdown } from "@/lib/pricing/overdue";

export interface EntryPreview {
  accountId: string;
  label: string;
  amountMinor: bigint;
}

// CYCLE 2 — the segregation split (Chetan, 2026-09-15). `treasury` is now
// `clientCollections`: money held for others, never the platform's. The
// platform's own funds live in `platformOperating`, and it receives ONLY the
// platform's margin. `feeIncome` is gone from every shape — it used to hold
// the margin AND the funder's interest in transit, which is precisely the
// commingling the standing rule forbids from this cycle onward.

export interface FundingAccounts {
  funderCash: { id: string; label: string };
  clientCollections: { id: string; label: string };
}

export interface DisbursementAccounts {
  clientCollections: { id: string; label: string };
  supplierPayable: { id: string; label: string };
  platformOperating: { id: string; label: string };
}

/** Funding: the funder's cash becomes client money the platform holds, at the
 *  locked principal. */
export function fundingEntries(
  snapshot: PricingBreakdown,
  a: FundingAccounts,
): EntryPreview[] {
  // DISCOUNTING, not lending (Chetan, 2026-09-18). The funder buys the
  // receivable at a discount: they pay in principal LESS the return they are
  // going to earn, and are repaid the principal at maturity. Their 0.53 is
  // never handed over and never held by us, so it cannot be mislaid, mis-
  // segregated, or paid back to them out of client money.
  //
  // Cycle 0 moved the full principal here and returned principal + interest at
  // payout. Same return, same platform margin — but it contradicted the
  // pricing screen's own "Funder pays in — principal less their return", and
  // the screen was the one telling the truth about the product.
  return [
    {
      accountId: a.funderCash.id,
      label: a.funderCash.label,
      amountMinor: -snapshot.funderFinancingMinor,
    },
    {
      accountId: a.clientCollections.id,
      label: a.clientCollections.label,
      amountMinor: snapshot.funderFinancingMinor,
    },
  ];
}

export interface RepaymentAccounts {
  debtorCash: { id: string; label: string };
  clientCollections: { id: string; label: string };
}

export interface PayoutAccounts {
  clientCollections: { id: string; label: string };
  funderCash: { id: string; label: string };
}

export interface ResidualAccounts {
  clientCollections: { id: string; label: string };
  supplierPayable: { id: string; label: string };
  platformOperating: { id: string; label: string };
}

/**
 * Repayment: the debtor pays the FACE VALUE — always, exactly, whether early
 * or late (the overdue charge is borne by the supplier's residual, Chetan's
 * decision 2026-09-07). The /pay page therefore never shows a moving number.
 */
export function repaymentEntries(faceValueMinor: bigint, a: RepaymentAccounts): EntryPreview[] {
  return [
    { accountId: a.debtorCash.id, label: a.debtorCash.label, amountMinor: -faceValueMinor },
    {
      accountId: a.clientCollections.id,
      label: a.clientCollections.label,
      amountMinor: faceValueMinor,
    },
  ];
}

/**
 * Payout: the funder gets their principal back plus the return they were owed,
 * plus their share of any overdue interest — and ALL of it comes out of client
 * money, in two entries.
 *
 * Cycle 1 needed three, because the funder's interest had been parked in
 * fee_income at disbursement and had to flow back out of it here (which is why
 * fee_income carried a negative line on an on-time deal). Under the cycle-2
 * split the platform never took that money in the first place, so there is
 * nothing to give back. The simpler shape IS the segregation.
 */
export function payoutEntries(
  snapshot: PricingBreakdown,
  overdue: OverdueBreakdown,
  a: PayoutAccounts,
): EntryPreview[] {
  // The funder is repaid the PRINCIPAL: their base return was taken as the
  // discount at funding and is not paid again here. Only the overdue share is
  // added, because extra days cannot be known — or discounted — up front.
  const funderTotal = snapshot.principalMinor + overdue.funderShareMinor;
  return [
    {
      accountId: a.clientCollections.id,
      label: a.clientCollections.label,
      amountMinor: -funderTotal,
    },
    { accountId: a.funderCash.id, label: a.funderCash.label, amountMinor: funderTotal },
  ];
}

/**
 * Residual: what remains of the face value after the funder's principal —
 * less the supplier's overdue charge, of which the platform's share stays as
 * fee income. On an on-time deal the overdue terms are zero and this
 * collapses to the simple two-entry case.
 */
export function residualEntries(
  snapshot: PricingBreakdown,
  overdue: OverdueBreakdown,
  a: ResidualAccounts,
): EntryPreview[] {
  const toSupplier = snapshot.supplierResidualMinor - overdue.supplierChargeMinor;
  const entries: EntryPreview[] = [
    {
      accountId: a.clientCollections.id,
      label: a.clientCollections.label,
      amountMinor: -(toSupplier + overdue.platformShareMinor),
    },
    { accountId: a.supplierPayable.id, label: a.supplierPayable.label, amountMinor: toSupplier },
  ];
  if (overdue.platformShareMinor !== 0n) {
    entries.push({
      accountId: a.platformOperating.id,
      label: a.platformOperating.label,
      amountMinor: overdue.platformShareMinor,
    });
  }
  return entries;
}

/**
 * Disbursement: three entries on purpose — the supplier's money and the
 * platform's margin leave client money as separate, visible lines. Fees are
 * lines, never margin (paper §7).
 *
 * CYCLE 2 — the platform takes ONLY its own margin. What the supplier paid in
 * fees decomposes exactly:
 *
 *   fees = principal − disbursement = supplierInterest + txnCost
 *        = platformMargin + funderInterest
 *
 * Cycle 1 moved the whole of `fees` into fee_income, so an account named for
 * the platform held the funder's interest for the life of the deal. Here the
 * funder's interest simply stays in client money until payout — it was never
 * the platform's, and now the ledger says so.
 */
export function disbursementEntries(
  snapshot: PricingBreakdown,
  a: DisbursementAccounts,
): EntryPreview[] {
  return [
    {
      accountId: a.clientCollections.id,
      label: a.clientCollections.label,
      amountMinor: -(snapshot.supplierDisbursementMinor + snapshot.platformMarginMinor),
    },
    {
      accountId: a.supplierPayable.id,
      label: a.supplierPayable.label,
      amountMinor: snapshot.supplierDisbursementMinor,
    },
    {
      accountId: a.platformOperating.id,
      label: a.platformOperating.label,
      amountMinor: snapshot.platformMarginMinor,
    },
  ];
}

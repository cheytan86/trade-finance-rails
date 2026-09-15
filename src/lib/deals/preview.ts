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

export interface FundingAccounts {
  funderCash: { id: string; label: string };
  treasury: { id: string; label: string };
}

export interface DisbursementAccounts {
  treasury: { id: string; label: string };
  supplierPayable: { id: string; label: string };
  feeIncome: { id: string; label: string };
}

/** Funding: the funder's cash becomes the platform's, at the locked principal. */
export function fundingEntries(
  snapshot: PricingBreakdown,
  a: FundingAccounts,
): EntryPreview[] {
  return [
    { accountId: a.funderCash.id, label: a.funderCash.label, amountMinor: -snapshot.principalMinor },
    { accountId: a.treasury.id, label: a.treasury.label, amountMinor: snapshot.principalMinor },
  ];
}

export interface RepaymentAccounts {
  debtorCash: { id: string; label: string };
  treasury: { id: string; label: string };
}

export interface PayoutAccounts {
  treasury: { id: string; label: string };
  funderCash: { id: string; label: string };
  feeIncome: { id: string; label: string };
}

export interface ResidualAccounts {
  treasury: { id: string; label: string };
  supplierPayable: { id: string; label: string };
  feeIncome: { id: string; label: string };
}

/**
 * Repayment: the debtor pays the FACE VALUE — always, exactly, whether early
 * or late (the overdue charge is borne by the supplier's residual, Chetan's
 * decision 2026-09-07). The /pay page therefore never shows a moving number.
 */
export function repaymentEntries(faceValueMinor: bigint, a: RepaymentAccounts): EntryPreview[] {
  return [
    { accountId: a.debtorCash.id, label: a.debtorCash.label, amountMinor: -faceValueMinor },
    { accountId: a.treasury.id, label: a.treasury.label, amountMinor: faceValueMinor },
  ];
}

/**
 * Payout: the funder gets their principal back plus the return they were
 * owed, plus their share of any overdue interest. The return was banked as
 * fee income at funding (the platform disbursed less than the funder paid
 * in), so it flows back OUT of fee income here — which is why fee_income
 * carries a negative line on an on-time deal.
 */
export function payoutEntries(
  snapshot: PricingBreakdown,
  overdue: OverdueBreakdown,
  a: PayoutAccounts,
): EntryPreview[] {
  const funderTotal =
    snapshot.principalMinor + snapshot.funderInterestMinor + overdue.funderShareMinor;
  return [
    {
      accountId: a.treasury.id,
      label: a.treasury.label,
      amountMinor: -(snapshot.principalMinor + overdue.funderShareMinor),
    },
    {
      accountId: a.feeIncome.id,
      label: a.feeIncome.label,
      amountMinor: -snapshot.funderInterestMinor,
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
      accountId: a.treasury.id,
      label: a.treasury.label,
      amountMinor: -(toSupplier + overdue.platformShareMinor),
    },
    { accountId: a.supplierPayable.id, label: a.supplierPayable.label, amountMinor: toSupplier },
  ];
  if (overdue.platformShareMinor !== 0n) {
    entries.push({
      accountId: a.feeIncome.id,
      label: a.feeIncome.label,
      amountMinor: overdue.platformShareMinor,
    });
  }
  return entries;
}

/**
 * Disbursement: three entries on purpose — the supplier's money and the
 * platform's fees leave the treasury as separate, visible lines. Fees are
 * lines, never margin (paper §7).
 */
export function disbursementEntries(
  snapshot: PricingBreakdown,
  a: DisbursementAccounts,
): EntryPreview[] {
  const fees = snapshot.principalMinor - snapshot.supplierDisbursementMinor;
  return [
    { accountId: a.treasury.id, label: a.treasury.label, amountMinor: -snapshot.principalMinor },
    {
      accountId: a.supplierPayable.id,
      label: a.supplierPayable.label,
      amountMinor: snapshot.supplierDisbursementMinor,
    },
    { accountId: a.feeIncome.id, label: a.feeIncome.label, amountMinor: fees },
  ];
}

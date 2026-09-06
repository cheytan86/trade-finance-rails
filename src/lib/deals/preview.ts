// The entry shapes for cycle 0's two movements, as pure functions. The gate
// dialog renders exactly what these produce, and the action books exactly
// what these produce — one source, so the confirmation cannot drift from the
// consequence.

import type { PricingBreakdown } from "@/lib/pricing";

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

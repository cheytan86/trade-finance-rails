// OVERDUE INTEREST — Chetan's model, decided 2026-09-07 (paper §9, v10).
//
// Late repayment accrues on the PRINCIPAL, act/360, at elevated rates on both
// sides of the spread:
//
//   supplier is CHARGED at   supplier rate + 2%
//   funder is PAID at        funder rate   + 2%
//   platform keeps           the difference between the two accruals
//
// The platform's share is computed as a DIFFERENCE, never independently
// rounded — so the three numbers always reconcile to the cent. Note the two
// +2%s cancel: the platform's overdue income equals the ORIGINAL spread
// applied to the overdue days, which is exactly the grid model's logic.
//
// Bearer: a programme parameter. Cycle 1 implements `supplier-residual` —
// the debtor always pays exactly the face value, and the charge reduces the
// supplier's residual. `debtor-pays` is the defined future alternative.

import { interestActDays, MoneyError } from "../money/index.ts";

/** The elevation applied to both sides, in basis points. */
export const OVERDUE_PREMIUM_BPS = 200;

export type OverdueBearer = "supplier-residual" | "debtor-pays";
export const OVERDUE_BEARER: OverdueBearer = "supplier-residual";

export interface OverdueInput {
  principalMinor: bigint;
  supplierRateBps: number;
  funderRateBps: number;
  daysLate: number;
  /** The supplier's residual — the charge can never exceed it. */
  residualMinor: bigint;
}

export interface OverdueBreakdown {
  daysLate: number;
  /** Charged to the supplier (deducted from the residual). */
  supplierChargeMinor: bigint;
  /** Paid to the funder on top of principal + agreed return. */
  funderShareMinor: bigint;
  /** The platform's share — always the difference of the two accruals. */
  platformShareMinor: bigint;
  /** True when the charge hit the residual ceiling and everything scaled down. */
  capped: boolean;
}

/** Whole days late; never negative. Both ends truncated to UTC midnight, the
 *  same convention the tenor uses. */
export function daysLateBetween(dueDateIso: string, repaidAt: Date): number {
  const due = Date.parse(`${dueDateIso}T00:00:00Z`);
  const paid = Date.UTC(repaidAt.getUTCFullYear(), repaidAt.getUTCMonth(), repaidAt.getUTCDate());
  return Math.max(0, Math.round((paid - due) / 86_400_000));
}

export function computeOverdue(input: OverdueInput): OverdueBreakdown {
  const { principalMinor, supplierRateBps, funderRateBps, daysLate, residualMinor } = input;

  if (daysLate < 0) {
    throw new MoneyError("overdue-negative-days", "Days late cannot be negative.");
  }
  if (funderRateBps > supplierRateBps) {
    // Approval already refuses negative-margin terms; this is the ledger-side
    // guard, because a negative platform share would be a silent loss.
    throw new MoneyError(
      "overdue-inverted-spread",
      "The funder's rate exceeds the supplier's; overdue interest would be a platform loss.",
    );
  }

  const none = {
    daysLate,
    supplierChargeMinor: 0n,
    funderShareMinor: 0n,
    platformShareMinor: 0n,
    capped: false,
  };
  if (daysLate === 0 || principalMinor <= 0n) return none;

  const supplierAccrual = interestActDays(
    principalMinor,
    supplierRateBps + OVERDUE_PREMIUM_BPS,
    daysLate,
  );
  const funderAccrual = interestActDays(
    principalMinor,
    funderRateBps + OVERDUE_PREMIUM_BPS,
    daysLate,
  );

  // The cap: a supplier cannot owe more than they were due. When it bites,
  // the funder takes what is available first (their capital bore the delay)
  // and the platform keeps only what remains.
  if (supplierAccrual > residualMinor) {
    const charged = residualMinor > 0n ? residualMinor : 0n;
    const funderShare = charged < funderAccrual ? charged : funderAccrual;
    return {
      daysLate,
      supplierChargeMinor: charged,
      funderShareMinor: funderShare,
      platformShareMinor: charged - funderShare,
      capped: true,
    };
  }

  return {
    daysLate,
    supplierChargeMinor: supplierAccrual,
    funderShareMinor: funderAccrual,
    // Difference, never rounded independently — the cents always reconcile.
    platformShareMinor: supplierAccrual - funderAccrual,
    capped: false,
  };
}

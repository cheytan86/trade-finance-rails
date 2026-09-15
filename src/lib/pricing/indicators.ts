// DERIVED PRICING INDICATORS — the three numbers ops actually judges a deal by
// (Chetan's choice, 2026-09-08). These are DISPLAY RATIOS, not money: they are
// computed from the breakdown's bigint amounts and returned in basis points,
// so no float ever touches an amount. Nothing here books, prices or settles.

import type { PricingBreakdown } from "./index.ts";

export interface PricingIndicators {
  /** (supplier interest + txn cost) ÷ what the supplier actually receives. */
  supplierAllInBps: number;
  /** The same cost annualised — the figure a supplier compares to their bank. */
  supplierAllInAnnualisedBps: number;
  /** Funder return ÷ cash the funder put in, annualised. */
  funderYieldAnnualisedBps: number;
  /** The platform's spread, as basis points of face value. */
  platformMarginBpsOfFace: number;
  /** Cash margin, straight from the breakdown — the only amount here. */
  platformMarginMinor: bigint;
  /** False when the tenor is zero, which makes annualisation meaningless. */
  annualisable: boolean;
}

/** Integer basis points of a ÷ b, rounded half away from zero. Returns 0 when
 *  the denominator is zero rather than pretending to a ratio. */
function bpsOf(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  const scaled = (numerator * 10_000n * 2n) / denominator;
  const rounded = scaled / 2n + (scaled % 2n === 0n ? 0n : scaled < 0n ? -1n : 1n);
  return Number(rounded);
}

/**
 * Annualised basis points: (numerator ÷ denominator) × 365 ÷ tenorDays, with
 * ONE rounding at the end. Annualising an already-rounded period rate
 * compounds its error — a bp of drift, but a bp that would show on screen.
 * Calendar-day basis; the paper records value dating and holiday calendars as
 * a real-world divergence.
 */
function annualisedBpsOf(numerator: bigint, denominator: bigint, tenorDays: number): number {
  if (denominator === 0n || tenorDays <= 0) return 0;
  return bpsOf(numerator * 365n, denominator * BigInt(tenorDays));
}

export function computeIndicators(
  b: PricingBreakdown,
  faceValueMinor: bigint,
): PricingIndicators {
  const supplierFees = b.supplierInterestMinor + b.txnCostMinor;

  return {
    supplierAllInBps: bpsOf(supplierFees, b.supplierDisbursementMinor),
    supplierAllInAnnualisedBps: annualisedBpsOf(
      supplierFees,
      b.supplierDisbursementMinor,
      b.tenorDays,
    ),
    funderYieldAnnualisedBps: annualisedBpsOf(
      b.funderInterestMinor,
      b.funderFinancingMinor,
      b.tenorDays,
    ),
    platformMarginBpsOfFace: bpsOf(b.platformMarginMinor, faceValueMinor),
    platformMarginMinor: b.platformMarginMinor,
    annualisable: b.tenorDays > 0,
  };
}

/** 1234 → "12.34%" — display only. */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

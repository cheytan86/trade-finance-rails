// Tenor-based act/360 pricing — copied in spirit from
// receivables-financing-mvp/src/lib/pricing.ts and corrected at the door:
// float round2 → bigint minor units (the sibling's rounding surface is the
// specific thing STACK_RULES.md bans), and the module gains the tests it
// never had. Pure, framework-free, no I/O — extraction seam 1.
//
// Snapshot semantics survive the copy unchanged: while an invoice is open
// this is called with "today" for a live estimate; at funding the result is
// persisted as pricing_snapshot and every later step reads the locked
// numbers. A shrinking tenor can never move a funded deal.

import { interestActDays, mulBps, divRound, MoneyError } from "../money/index.ts";

export interface PricingTerms {
  faceValueMinor: bigint;
  dueDate: string; // ISO date
  advanceRateBps: number;
  supplierRateBps: number;
  funderRateBps: number;
  txnCostType: "fixed" | "percent";
  /** minor units when fixed; basis points when percent */
  txnCostValue: bigint;
}

export interface PricingBreakdown {
  financingDate: string; // ISO timestamp used for the tenor
  tenorDays: number;
  principalMinor: bigint;
  supplierInterestMinor: bigint;
  txnCostMinor: bigint;
  supplierDisbursementMinor: bigint;
  funderInterestMinor: bigint;
  funderFinancingMinor: bigint;
  platformMarginMinor: bigint;
  supplierResidualMinor: bigint;
}

/** Whole calendar days between an ISO date and a JS Date, both at UTC midnight. */
export function tenorDaysBetween(dueDateIso: string, from: Date): number {
  const due = Date.parse(`${dueDateIso}T00:00:00Z`);
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.max(0, Math.round((due - start) / 86_400_000));
}

export function computePricing(terms: PricingTerms, financingDate: Date): PricingBreakdown {
  const tenorDays = tenorDaysBetween(terms.dueDate, financingDate);

  const principalMinor = mulBps(terms.faceValueMinor, terms.advanceRateBps);
  const supplierInterestMinor = interestActDays(principalMinor, terms.supplierRateBps, tenorDays);
  const txnCostMinor =
    terms.txnCostType === "fixed"
      ? terms.txnCostValue
      : divRound(principalMinor * terms.txnCostValue, 10_000n);
  const supplierDisbursementMinor = principalMinor - supplierInterestMinor - txnCostMinor;

  const funderInterestMinor = interestActDays(principalMinor, terms.funderRateBps, tenorDays);
  const funderFinancingMinor = principalMinor - funderInterestMinor;

  // The margin identity: what the funder pays in, minus what the supplier
  // receives — fees are visible lines, never margin (paper §7/§9).
  const platformMarginMinor = funderFinancingMinor - supplierDisbursementMinor;
  const supplierResidualMinor = terms.faceValueMinor - principalMinor;

  return {
    financingDate: financingDate.toISOString(),
    tenorDays,
    principalMinor,
    supplierInterestMinor,
    txnCostMinor,
    supplierDisbursementMinor,
    funderInterestMinor,
    funderFinancingMinor,
    platformMarginMinor,
    supplierResidualMinor,
  };
}

// ── snapshot (de)serialization — jsonb can't hold bigint ────────────────────

type SnapshotJson = { [K in keyof PricingBreakdown]: string | number };

export function snapshotToJson(b: PricingBreakdown): SnapshotJson {
  return Object.fromEntries(
    Object.entries(b).map(([k, v]) => [k, typeof v === "bigint" ? v.toString() : v]),
  ) as SnapshotJson;
}

const MINOR_FIELDS = [
  "principalMinor",
  "supplierInterestMinor",
  "txnCostMinor",
  "supplierDisbursementMinor",
  "funderInterestMinor",
  "funderFinancingMinor",
  "platformMarginMinor",
  "supplierResidualMinor",
] as const;

export function parseSnapshot(raw: unknown): PricingBreakdown {
  if (raw === null || typeof raw !== "object") {
    throw new MoneyError("pricing-snapshot-shape", "pricing snapshot is not an object");
  }
  const o = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {
    financingDate: String(o.financingDate),
    tenorDays: Number(o.tenorDays),
  };
  for (const f of MINOR_FIELDS) {
    const v = o[f];
    if (typeof v !== "string" || !/^-?\d+$/.test(v)) {
      throw new MoneyError("pricing-snapshot-shape", `snapshot field ${f} is not an integer string`);
    }
    out[f] = BigInt(v);
  }
  return out as unknown as PricingBreakdown;
}

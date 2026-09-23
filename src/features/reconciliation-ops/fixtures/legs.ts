// SYNTHETIC OPEN LEGS — what a payment could be attributed TO.
//
// Typed from the schema's own row type (import type only; no database client
// is imported anywhere in this feature folder). These are the candidates the
// attribution screen offers, and between them they build every eval case:
// an exact match, a leg that takes two payments, two legs that cannot be told
// apart, and a deal with nothing left to pay.

import type { pendingSettlements } from "@/db/schema";

export type OpenLeg = typeof pendingSettlements.$inferSelect;

function usd(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

/** Frozen entries, as the column stores them: amounts are strings because
 *  jsonb cannot hold bigint — the same pattern pricing_snapshot uses. */
function entries(...rows: Array<[string, string]>): unknown {
  return rows.map(([accountId, amountMinor]) => ({ accountId, amountMinor }));
}

const ACC = {
  clientCollections: "acc-client-collections",
  debtorCash: "acc-debtor-cash",
  supplierPayable: "acc-supplier-payable",
  funderCash: "acc-funder-cash",
} as const;

function leg(over: Partial<OpenLeg> & Pick<OpenLeg, "id" | "invoiceId" | "amountMinor">): OpenLeg {
  return {
    type: "repayment",
    rail: "circle-fiat",
    status: "initiated",
    railReference: null,
    idempotencyKey: `repayment:${over.invoiceId}`,
    entries: entries(
      [ACC.debtorCash, `-${over.amountMinor}`],
      [ACC.clientCollections, `${over.amountMinor}`],
    ),
    failureReason: null,
    initiatedAt: new Date("2026-09-18T07:00:00.000Z"),
    resolvedAt: null,
    ...over,
  } as OpenLeg;
}

// ── case 1 · the exact match ────────────────────────────────────────────────

/**
 * The stuck deal. Real invoice `353a4c79`, sitting at `disbursed`, waiting for
 * a $100 repayment that arrived and was never booked. Attributing
 * UNATTRIBUTED_100 to this leg is the demo's opening move, and the deal
 * advancing past `disbursed` afterwards is what proves the booking took.
 */
export const LEG_AWAITING_100: OpenLeg = leg({
  id: "leg-353a4c79-repayment",
  invoiceId: "353a4c79-0000-4000-8000-00353a4c7900",
  amountMinor: usd("100.00"),
});

// ── case 3 · two legs that cannot be told apart ─────────────────────────────

/** A second, unrelated deal wanting exactly the same amount. With one $100
 *  payment on the table the product must show BOTH and rank NEITHER — the
 *  refusal to guess is the requirement, not the ambiguity itself. */
export const LEG_ALSO_AWAITING_100: OpenLeg = leg({
  id: "leg-7b21ee90-repayment",
  invoiceId: "7b21ee90-0000-4000-8000-007b21ee9000",
  amountMinor: usd("100.00"),
  initiatedAt: new Date("2026-09-18T07:20:00.000Z"),
});

// ── case 2 · the leg that must accept two movements ─────────────────────────

/**
 * Expects 320.00 and will receive 200.00 then 120.00. Impossible today: the
 * idempotency key is `repayment:<invoiceId>` and the column is unique, so the
 * second movement is refused by Postgres. That is FIX A, and this leg is how
 * it is proved.
 */
export const LEG_TAKING_PART_PAYMENTS: OpenLeg = leg({
  id: "leg-9c44af12-repayment",
  invoiceId: "9c44af12-0000-4000-8000-009c44af1200",
  amountMinor: usd("320.00"),
  initiatedAt: new Date("2026-09-19T08:00:00.000Z"),
});

// ── case 5 · nothing left to pay ────────────────────────────────────────────

/** Already settled. Attributing anything to this must be refused with a
 *  named reason — there is nothing left for the money to pay. */
export const LEG_ALREADY_SETTLED: OpenLeg = leg({
  id: "leg-ec8e7dc2-repayment",
  invoiceId: "ec8e7dc2-0000-4000-8000-00ec8e7dc200",
  amountMinor: usd("18200.00"),
  status: "settled",
  railReference: "8b2ddf63-0470-4ce5-be5d-cefce5f9f416",
  resolvedAt: new Date("2026-09-18T10:04:23.000Z"),
});

/** A leg that failed for a real reason — wrong amount on the rail's record.
 *  Kept so FIX B can be argued precisely: THIS is what `failed` is for, and an
 *  ambiguity is not it. */
export const LEG_GENUINELY_FAILED: OpenLeg = leg({
  id: "leg-4d10bb77-repayment",
  invoiceId: "4d10bb77-0000-4000-8000-004d10bb7700",
  amountMinor: usd("250.00"),
  status: "failed",
  failureReason:
    "Circle's record is for 240.00, not 250.00. Nothing has been booked.",
  resolvedAt: new Date("2026-09-19T11:00:00.000Z"),
});

/** Every leg a payment could plausibly be offered against — the open ones
 *  only. Settled and failed legs are deliberately excluded: they are here to
 *  be refused, not to be candidates. */
export const OPEN_LEGS: readonly OpenLeg[] = [
  LEG_AWAITING_100,
  LEG_ALSO_AWAITING_100,
  LEG_TAKING_PART_PAYMENTS,
];

export const ALL_LEGS: readonly OpenLeg[] = [
  ...OPEN_LEGS,
  LEG_ALREADY_SETTLED,
  LEG_GENUINELY_FAILED,
];

// Re-deriving a fiat movement from Circle's own record — the fiat sibling of
// verify-usdc.ts, and held to the same discipline.
//
// WHAT IS DIFFERENT, AND IT IS THE PRODUCT'S POINT. On the USDC rail the
// evidence is a transaction anyone can check on a public explorer. Here the
// evidence is a row in Circle's database. We can re-read it, we cannot
// independently verify it, and every surface that renders it says so. That is
// not a shortcoming to hide — it is precisely the axis cycle 4's priced rail
// comparison exists to compare.
//
// WHAT IS THE SAME: a mismatch THROWS. Wrong amount, wrong destination, wrong
// currency are not outcomes of a payment; they are signs something is wrong,
// and they must be loud rather than quietly booked.

import { RailError, type VerifyOutcome, type VerifiedTransfer } from "./types.ts";
import { decimalToMinor, type CircleDeposit, type CirclePayout } from "./circle-client.ts";

export interface ExpectedMovement {
  amountMinor: bigint;
  currency: string;
  /** For outbound legs: the registered wire account the money must land in. */
  destinationId?: string;
  fromLabel: string;
  toLabel: string;
}

/**
 * Map a Circle payout to one of the seam's three outcomes.
 *
 * `pending` is the honest answer for most of a payout's life and must never be
 * dressed up as an error: nothing has booked, nothing has failed, and the leg
 * stays in flight until Circle decides.
 */
export function verifyCirclePayout(payout: CirclePayout, expected: ExpectedMovement): VerifyOutcome {
  assertCurrency(payout.amount.currency, expected.currency);

  // Destination first: a payout that completed to the WRONG account is the
  // worst case, and checking amount first would let it pass on a match.
  if (expected.destinationId && payout.destination?.id !== expected.destinationId) {
    throw new RailError(
      "rail-wrong-destination",
      `This payout went to ${payout.destination?.id ?? "an unrecorded destination"}, not ${expected.destinationId}. Nothing has been booked.`,
    );
  }

  const actual = decimalToMinor(payout.amount.amount);
  if (actual !== expected.amountMinor) {
    throw new RailError(
      "rail-wrong-amount",
      `Circle settled ${payout.amount.amount} ${payout.amount.currency}, not the expected amount. Nothing has been booked — a mismatched settlement is a reconciliation exception (cycle 3).`,
    );
  }

  if (payout.status === "failed") {
    return {
      status: "failed",
      reason: payout.errorCode
        ? `Circle reports this payout failed: ${payout.errorCode}.`
        : "Circle reports this payout failed.",
    };
  }
  if (payout.status !== "complete") {
    return { status: "pending", detail: `Circle reports this payout as ${payout.status}.` };
  }

  return { status: "settled", transfer: transferFrom(payout.id, actual, expected) };
}

/**
 * Inbound legs have no id at the moment we ask for them — a deposit is created
 * by the counterparty's bank, not by us, so we can only recognise it after the
 * fact. It is matched on the exact amount, within the window since the leg was
 * initiated.
 *
 * TWO REFUSALS, AND BOTH ARE DELIBERATE:
 *   · no match yet → `pending`. The money has not arrived. This is normal.
 *   · more than one match → THROW. Two deposits of the same amount in the same
 *     window cannot be told apart, and guessing which one settles this invoice
 *     is exactly the ambiguous-match exception cycle 3 exists to handle. The
 *     refusal names it rather than picking one.
 */
export function matchInboundDeposit(
  deposits: CircleDeposit[],
  expected: ExpectedMovement,
  initiatedAt: Date,
): VerifyOutcome {
  const candidates = deposits.filter((d) => {
    if (d.status === "failed") return false;
    if (d.amount.currency !== expected.currency) return false;
    let minor: bigint;
    try {
      minor = decimalToMinor(d.amount.amount);
    } catch {
      return false;
    }
    if (minor !== expected.amountMinor) return false;
    // Only deposits that could plausibly be this leg's. A deposit that landed
    // before we asked for the money is somebody else's.
    return new Date(d.createDate).getTime() >= initiatedAt.getTime() - CLOCK_SKEW_MS;
  });

  if (candidates.length === 0) {
    return { status: "pending", detail: "No matching deposit has arrived yet." };
  }
  if (candidates.length > 1) {
    throw new RailError(
      "rail-ambiguous-match",
      `${candidates.length} deposits of this exact amount arrived in this window and cannot be told apart. Nothing has been booked — this is a reconciliation exception (cycle 3).`,
    );
  }

  const [d] = candidates;
  if (d.status !== "complete") {
    return { status: "pending", detail: `The matching deposit is ${d.status}.` };
  }
  return {
    status: "settled",
    transfer: transferFrom(d.id, decimalToMinor(d.amount.amount), expected),
  };
}

/** Bank clocks and ours are not the same clock; a minute of slack, no more. */
const CLOCK_SKEW_MS = 60_000;

function assertCurrency(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new RailError(
      "rail-wrong-currency",
      `Circle's record is in ${actual}, not ${expected}. Nothing has been booked; this demo does not convert.`,
    );
  }
}

function transferFrom(
  reference: string,
  amountMinor: bigint,
  expected: ExpectedMovement,
): VerifiedTransfer {
  return {
    reference,
    evidenceKind: "circle-payment-id",
    amountMinor,
    from: expected.fromLabel,
    to: expected.toLabel,
    // NO explorerUrl, and that absence is load-bearing. This evidence is real
    // and it is not independently checkable — only Circle can confirm it.
    // provenance-badge.tsx renders that as its own treatment.
  };
}

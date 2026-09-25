// THE FIAT RAIL — Circle sandbox. The first rail in this product that cannot
// answer `verify` inside the request that called `execute`.
//
// Direction decides the mechanism, and the two are not symmetric:
//
//   OUTBOUND (disbursement · payout · residual) — we instruct a payout to a
//   registered wire bank account. We have an id immediately; the money takes
//   its own time.
//
//   INBOUND (funding · repayment) — somebody else's bank sends money to us.
//   In sandbox we simulate that with a mock wire, WHICH MEANS THE PLATFORM IS
//   STANDING IN FOR THE COUNTERPARTY'S BANK — exactly as the four demo wallets
//   stand in for counterparties on the USDC rail. Every surface that renders
//   an inbound fiat leg says so. And because a deposit is created by the
//   sender rather than by us, there is no id to hold: it is recognised
//   afterwards, by amount and arrival window (see verify-circle.ts).
//
// Custody posture, unchanged and stated wherever this rail appears: the
// sandbox balance is platform-held and the demonstration is deliberately not
// bankruptcy-remote (paper §10 Q18). No real money can move: the client
// refuses any key without a SAND_ prefix.

import {
  RailError,
  type SettlementRail,
  type TransferPreview,
  type TransferReceipt,
  type TransferRequest,
  type VerifyOutcome,
} from "./types.ts";
import {
  createMockWire,
  createPayout,
  getPayout,
  getWireInstructions,
  listDeposits,
  listWireAccounts,
  minorToDecimal,
  circleIdempotencyKey,
} from "./circle-client.ts";
import { matchInboundDeposit, verifyCirclePayout } from "./verify-circle.ts";

const CURRENCY = "USD";

/** Money coming IN is simulated; money going OUT is a real sandbox payout. */
function isInbound(req: TransferRequest): boolean {
  return req.to === "platform";
}

const LABELS: Record<TransferRequest["from"], string> = {
  funder: "funder's bank (sandbox)",
  platform: "platform Circle account (sandbox)",
  supplier: "supplier's bank (sandbox)",
  debtor: "debtor's bank (sandbox)",
};

/**
 * Inbound legs need the platform's own wire account and Circle's beneficiary
 * details. Both are read from the API at call time rather than configured,
 * so there is nothing to keep in sync and nothing to go stale.
 */
async function platformInboundTarget(): Promise<{
  trackingRef: string;
  beneficiaryAccountNumber: string;
}> {
  const accounts = await listWireAccounts();
  const usable = accounts.find((a) => a.status === "complete") ?? accounts[0];
  if (!usable) {
    throw new RailError(
      "circle-no-wire-account",
      "No wire bank account is registered with Circle — run step 2 of docs/circle-sandbox-runbook.md.",
    );
  }
  const instructions = await getWireInstructions(usable.id);
  return {
    trackingRef: instructions.trackingRef ?? usable.trackingRef,
    // CIRCLE'S receiving account, not ours. Passing ours returns a 400 with no
    // field named, at every amount — the runbook records that hour.
    beneficiaryAccountNumber: instructions.beneficiaryBank.accountNumber,
  };
}

export const circleFiatRail: SettlementRail = {
  id: "circle-fiat",
  label: "Fiat · Circle sandbox (no real money)",
  // The whole reason cycle 2 exists: this rail answers `pending` and tells the
  // truth later, by webhook.
  settlement: "deferred",

  async prepare(req: TransferRequest): Promise<TransferPreview> {
    // REFUSE HERE, BEFORE THE DIALOG OPENS — never at execute. An operator
    // must not confirm a movement that was never going to be possible.
    if (!isInbound(req) && !req.toRef) {
      throw new RailError(
        "rail-no-destination",
        `No bank account is registered for the ${req.to} on the fiat rail, so there is nowhere to send this money. Register one before settling this leg.`,
      );
    }
    return {
      rail: "circle-fiat",
      amountMinor: req.amountMinor,
      fromLabel: LABELS[req.from],
      toLabel: LABELS[req.to],
      onChain: false,
      note: isInbound(req)
        ? "Simulates the counterparty's bank wiring money in — the platform stands in for their bank, as the demo wallets do on the USDC rail. It settles in batches and can take several minutes; nothing books until Circle confirms the deposit."
        : "Instructs a real sandbox payout to a registered bank account. It settles later — nothing books until Circle confirms, and this deal will not advance in the meantime.",
    };
  },

  async execute(req: TransferRequest): Promise<TransferReceipt> {
    if (req.amountMinor <= 0n) {
      throw new RailError("rail-nonpositive-amount", "A transfer must move a positive amount.");
    }
    const amount = { amount: minorToDecimal(req.amountMinor), currency: CURRENCY };

    if (isInbound(req)) {
      const target = await platformInboundTarget();
      await createMockWire({
        trackingRef: target.trackingRef,
        beneficiaryAccountNumber: target.beneficiaryAccountNumber,
        amount,
        memo: req.idempotencyKey,
      });
      // A mock wire returns no id — the deposit does not exist yet. There is
      // deliberately nothing to fabricate here: the reference records what we
      // asked for, and verify() recognises the arrival by amount and window.
      return { reference: `inbound:${req.idempotencyKey}` };
    }

    const payout = await createPayout({
      // Hashed, never regenerated — a retry must reuse the same Circle key or
      // Circle creates a second payout. See circleIdempotencyKey.
      idempotencyKey: circleIdempotencyKey(req.idempotencyKey),
      destinationId: req.toRef!,
      amount,
    });
    return { reference: payout.id };
  },

  async verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifyOutcome> {
    const expected = {
      amountMinor: req.amountMinor,
      currency: CURRENCY,
      fromLabel: LABELS[req.from],
      toLabel: LABELS[req.to],
    };

    if (receipt.reference.startsWith("inbound:")) {
      // Recognise the deposit rather than look it up: we never had its id.
      // The window starts when THIS LEG asked for the money. Falling back to
      // the sliding hour is what let a deposit from before the leg existed
      // look like a candidate (case 1, 2026-09-18).
      const deposits = await listDeposits();
      return matchInboundDeposit(deposits, expected, req.initiatedAt ?? inboundInitiatedAt());
    }

    const payout = await getPayout(receipt.reference);
    return verifyCirclePayout(payout, { ...expected, destinationId: req.toRef });
  },
};

/**
 * KNOWN LIMITATION, stated rather than hidden. Inbound matching should be
 * bounded by when the leg was actually asked for, and the pending row holds
 * that timestamp — but `verify` receives only the request and the receipt, so
 * it cannot see it. The window is therefore a fixed hour.
 *
 * What still protects the ledger: the amount must match EXACTLY, and two
 * candidates refuse rather than guess. A wider window makes an ambiguous match
 * more likely, and an ambiguous match books nothing.
 */
function inboundInitiatedAt(): Date {
  return new Date(Date.now() - INBOUND_WINDOW_MS);
}

const INBOUND_WINDOW_MS = 60 * 60 * 1000; // one hour

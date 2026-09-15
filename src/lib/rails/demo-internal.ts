// The trivial rail: cycle 0's behaviour, expressed through the same interface
// as USDC. Its existence is the proof that the seam is real — if the state
// machine cannot tell this apart from an on-chain rail, the abstraction holds.
//
// Nothing external moves. The "transfer" is an accounting fact the platform
// asserts about itself, and every surface labels it demo-internal.

import {
  RailError,
  type SettlementRail,
  type TransferPreview,
  type TransferReceipt,
  type TransferRequest,
  type VerifyOutcome,
} from "./types.ts";

const LABELS: Record<TransferRequest["from"], string> = {
  funder: "funder (demo-internal)",
  platform: "platform treasury (demo-internal)",
  supplier: "supplier (demo-internal)",
  debtor: "debtor (demo-internal)",
};

export const demoInternalRail: SettlementRail = {
  id: "demo-internal",
  label: "Demo-internal (no external movement)",
  // Books inside the request that asked for it — cycle 0's behaviour.
  settlement: "immediate",

  async prepare(req: TransferRequest): Promise<TransferPreview> {
    return {
      rail: "demo-internal",
      amountMinor: req.amountMinor,
      fromLabel: LABELS[req.from],
      toLabel: LABELS[req.to],
      onChain: false,
      note: "Books instantly. Evidence is a demo reference, not external proof.",
    };
  },

  async execute(req: TransferRequest): Promise<TransferReceipt> {
    if (req.amountMinor <= 0n) {
      throw new RailError("rail-nonpositive-amount", "A transfer must move a positive amount.");
    }
    return { reference: `demo:${req.idempotencyKey}` };
  },

  async verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifyOutcome> {
    // The only check available: the reference is the one this request would
    // have produced. Honest about what that proves — tamper-evidence within
    // the demo, never independent truth.
    const expected = `demo:${req.idempotencyKey}`;
    if (receipt.reference !== expected) {
      throw new RailError(
        "rail-reference-mismatch",
        `Evidence does not belong to this movement (expected ${expected}).`,
      );
    }
    return {
      status: "settled",
      transfer: {
        reference: receipt.reference,
        evidenceKind: "demo-internal",
        amountMinor: req.amountMinor,
        from: LABELS[req.from],
        to: LABELS[req.to],
      },
    };
  },
};

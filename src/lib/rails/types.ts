// THE SETTLEMENT SEAM — the interface the state machine sees and every rail
// hides behind (design §1). Framework-free by rule (STACK_RULES seam #1):
// nothing here imports Next, the database, or React.
//
// The contract, in four moves:
//   prepare  — what the human gate will show BEFORE anything moves
//   execute  — actually move the money (only after the gate is approved)
//   verify   — re-derive what happened from the rail's own source of truth,
//              never trusting what execute claimed
//   evidence — what proves it, in the shape the ledger records
//
// The state machine must not be able to tell rails apart: same call sites,
// same result shapes, same refusals. Cycle 1 ships two implementations —
// `demo-internal` (cycle 0's instant booking) and `usdc` (Base Sepolia).

export type RailId = "demo-internal" | "usdc";

/** Who is moving money, in rail-neutral terms. The rail maps these to its own
 *  addressing (a wallet, later a bank account or a Circle wallet id). */
export type RailActor = "funder" | "platform" | "supplier" | "debtor";

export interface TransferRequest {
  /** Idempotency: the same key must never move money twice. */
  idempotencyKey: string;
  from: RailActor;
  to: RailActor;
  /** Minor units (cents) — the ledger's unit. The rail converts at its own
   *  boundary (USDC has 6dp; cents have 2). */
  amountMinor: bigint;
}

/** What the gate dialog shows before a person confirms. */
export interface TransferPreview {
  rail: RailId;
  amountMinor: bigint;
  /** Rail-specific, human-readable — an address, an account, a label. */
  fromLabel: string;
  toLabel: string;
  /** True when real external money moves and the demo must say so. */
  onChain: boolean;
  /** Anything the person should know before confirming (fees, timing). */
  note?: string;
}

/** The result of execute(): a claim, not proof. Nothing books on this alone. */
export interface TransferReceipt {
  /** The rail's own identifier — a tx hash, a payment id, a demo reference. */
  reference: string;
}

/** What verify() returns once the rail's source of truth has been consulted. */
export interface VerifiedTransfer {
  reference: string;
  evidenceKind: "demo-internal" | "tx-hash" | "circle-payment-id" | "statement-line";
  amountMinor: bigint;
  from: string;
  to: string;
  /** A link a human can open to check it themselves; absent for off-chain rails. */
  explorerUrl?: string;
}

export class RailError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

export interface SettlementRail {
  readonly id: RailId;
  /** Shown wherever the rail is named; the demo must never look production. */
  readonly label: string;
  prepare(req: TransferRequest): Promise<TransferPreview>;
  execute(req: TransferRequest): Promise<TransferReceipt>;
  /** Re-derives the movement from the rail's own records. Throws RailError
   *  with a named rule on any mismatch — it never returns a soft failure. */
  verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifiedTransfer>;
}

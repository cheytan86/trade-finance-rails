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

export type RailId = "demo-internal" | "usdc" | "circle-fiat";

/** Who is moving money, in rail-neutral terms. The rail maps these to its own
 *  addressing (a wallet, later a bank account or a Circle wallet id). */
export type RailActor = "funder" | "platform" | "supplier" | "debtor";

export interface TransferRequest {
  /** Idempotency: the same key must never move money twice. */
  idempotencyKey: string;
  from: RailActor;
  to: RailActor;
  /** Rail-specific addressing for the counterparties, RESOLVED BY THE CALLER.
   *  An off-chain rail pays a registered bank account, and that registry lives
   *  in the database — which this module may not read (the seam is
   *  framework-free). So the caller looks it up and passes it in. Absent for
   *  rails that address their actors themselves, as USDC does from env. */
  fromRef?: string;
  toRef?: string;
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

/**
 * What `verify` found when it consulted the rail's own record. Three answers,
 * and the distinction between the last two is the whole of cycle 2:
 *
 *   settled — it happened, here is the proof. Book it.
 *   pending — the rail has not made up its mind. Book NOTHING, fail nothing,
 *             and leave the leg in flight. "Not yet" is not "no".
 *   failed  — the rail's own record says it will not happen. Book nothing;
 *             there is nothing to reverse because nothing moved.
 *
 * A MISMATCH IS NOT ONE OF THESE. If the rail's record contradicts what we
 * expected — wrong amount, wrong recipient, wrong chain — verify still THROWS
 * a RailError with its named rule, because that is not an outcome of the
 * payment, it is a sign that something is wrong and must be loud.
 */
export type VerifyOutcome =
  | { status: "settled"; transfer: VerifiedTransfer }
  | { status: "pending"; detail?: string }
  | { status: "failed"; reason: string };

/** Whether this rail can answer `verify` inside the request that called
 *  `execute`. Deferred rails cannot, and the screens say so before a human
 *  confirms. */
export type SettlementMode = "immediate" | "deferred";

export interface SettlementRail {
  readonly id: RailId;
  /** Shown wherever the rail is named; the demo must never look production. */
  readonly label: string;
  readonly settlement: SettlementMode;
  prepare(req: TransferRequest): Promise<TransferPreview>;
  execute(req: TransferRequest): Promise<TransferReceipt>;
  /** Re-derives the movement from the rail's own records. Returns one of the
   *  three outcomes above; throws RailError with a named rule on a mismatch. */
  verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifyOutcome>;
}

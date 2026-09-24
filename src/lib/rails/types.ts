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
  /** WHEN THIS LEG ASKED FOR THE MONEY, resolved by the caller from the
   *  pending row. A rail that recognises an inbound payment by amount and
   *  arrival — rather than by an id it never had — needs to know which
   *  arrivals could possibly be this leg's, and "before we asked" is the only
   *  answer that does not depend on how long ago the question is being asked.
   *
   *  Cycle 2 shipped without it and approximated with `now − one hour`, which
   *  matched a deposit that had settled a different invoice 49 minutes before
   *  this leg existed. Optional so a rail that does not recognise by arrival
   *  can ignore it. */
  initiatedAt?: Date;
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

/**
 * MONEY THAT ARRIVED, as the rail itself reports it — cycle 3.
 *
 * Deliberately NOT a database row. Amount, arrival time and sender are always
 * read from the rail, never copied into our tables and trusted: the rail is
 * the record of what it holds, and a local copy is a second source of truth
 * about money, which is the ambiguity this cycle exists to remove.
 *
 * `reference` is the rail's own id and is what `settlement_events.evidence_ref`
 * carries once a payment is attributed — so "has this been spent?" is a join,
 * never a stored flag.
 */
export interface InboundPayment {
  reference: string;
  amountMinor: bigint;
  currency: string;
  /** When the RAIL says the money moved — not when we noticed. Aging needs
   *  our own first-seen timestamp, which is why one is persisted beside this. */
  arrivedAt: Date;
  /** Whatever the rail can say about who sent it. Every field is optional
   *  because a bank may say nothing useful, and a payment with no sender is
   *  still fully attributable — the sender is context for a person, never a
   *  precondition. */
  sender?: { id?: string; name?: string };
  /** The rail's own view of finality. Only `complete` may be attributed. */
  status: "pending" | "complete" | "failed";
}

/**
 * WHAT A RAIL SAYS WHEN ASKED WHAT HAS ARRIVED.
 *
 * `unsupported` is a first-class answer, not an empty list. On the USDC rail
 * the platform holds every demo wallet's key and signs AS the counterparty, so
 * no payment ever arrives from outside and there is nothing to reconcile.
 * Rendering that as an empty queue would read as "no money arrived", which is
 * a different statement and a false one.
 */
export type InboundListing =
  | { supported: true; payments: InboundPayment[] }
  | { supported: false; reason: string };

/**
 * WHO, IF ANYONE, CAN CHECK A SETTLEMENT ON THIS RAIL — cycle 4.
 *
 * This is the axis `DESIGN_SYSTEM_NOTES.md` reserved for this cycle at cycle
 * 2's close, when it gave a Circle payment id its own provenance treatment:
 * *"solid because it is real, unlinked because there is nothing to open…
 * that distinction is the axis cycle 4 compares rails on."*
 *
 *   "us-only"    our word, and nothing else. demo-internal asserts an
 *                accounting fact about itself; nothing left the building.
 *   "public"     anyone can verify it, independently, forever. A Base
 *                Sepolia transaction hash.
 *   "custodian"  real evidence, held by someone who is not us and cannot be
 *                read by the person looking at the screen. A Circle payment
 *                id.
 *
 * WHY IT IS ON THIS INTERFACE and not a map in a feature folder: a rail must
 * not be able to join the comparison without answering. Cycle 3 settled the
 * same argument about `listInbound` — *"optional is how a rail ends up
 * silently answering 'nothing arrived' instead of 'I have no outside'"* — and
 * cycle 11's Visa adapter is the next rail this will catch.
 *
 * IT IS NOT A RANKING. "public" is not better than "us-only"; they describe
 * different things a reader may need. The screen renders them in registry
 * order and marks none preferred.
 */
export type Verifiability = "us-only" | "public" | "custodian";

export interface SettlementRail {
  readonly id: RailId;
  /** Shown wherever the rail is named; the demo must never look production. */
  readonly label: string;
  readonly settlement: SettlementMode;
  /**
   * WHAT CAN GO WRONG ON THIS RAIL, in the rail's own words — cycle 4.
   *
   * Declared rather than measured, and it sits beside the measured count
   * deliberately. Each alone misleads: `demo-internal` has zero failures
   * because NOTHING EVER LEAVES THE BUILDING, and a zero that means "we never
   * tried" is indistinguishable from one that means "it always works". Only
   * this sentence can tell them apart. Conversely a declared danger alone is
   * what the pricing dropdown already had — prose nobody can check.
   *
   * One sentence, present tense, no hedging. It must be true before the rail
   * has ever been used, because that is when it matters most.
   */
  readonly failureModes: string;
  /** Who can independently check a settlement on this rail. See above. */
  readonly verifiability: Verifiability;
  prepare(req: TransferRequest): Promise<TransferPreview>;
  execute(req: TransferRequest): Promise<TransferReceipt>;
  /** Re-derives the movement from the rail's own records. Returns one of the
   *  three outcomes above; throws RailError with a named rule on a mismatch. */
  verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifyOutcome>;
  /**
   * EVERYTHING THE RAIL HOLDS FOR US, attributed or not — cycle 3.
   *
   * Note what this is NOT: it is not "the legs we are waiting for". Every
   * other method on this interface starts from a movement the product already
   * knows about. This one starts from the rail's own record and asks what is
   * there, which is the only way money nobody expected can ever be seen.
   *
   * A rail where money never arrives from outside answers `unsupported` and
   * the screen says so — an empty list would read as "no money arrived", which
   * is a different statement and a false one.
   */
  listInbound(): Promise<InboundListing>;
}

// THE STATE MODEL — pure, and deliberately so.
//
// Everything here is a function of facts handed in: the payment as the rail
// reports it, and the movements already booked. Nothing reads a database,
// nothing writes one, and no state is stored.
//
// WHY DERIVED RATHER THAN STORED. The house rule, which this feature follows
// rather than reinvents: balances are SUM(entries) and are never stored
// (src/lib/ledger/index.ts), and a deal's status is derived from its booked
// legs rather than trusted from a column (advanceFromBookedLegs). A stored
// `status` on a payment would be a FOURTH place money state lives, and it
// would drift from the other three. So:
//
//   attributed  = SUM(movements whose evidence_ref is this payment's reference)
//   outstanding = the payment's amount − attributed
//
// THE REFUSALS ARE THE POINT. Epics A–D prove the feature works; epic E proves
// it cannot be made to lie. Every rule below is one a person could otherwise
// talk themselves past at 6pm on a Friday, and each returns a named reason
// rather than a boolean, because a refusal ops cannot read is a refusal ops
// will work around.

import type { InboundPayment } from "@/lib/rails/types";
import type { pendingSettlements } from "@/db/schema";

/** A leg money could be attributed to, typed from the schema's own row type.
 *  Declared here rather than beside the fixtures so production code never
 *  reaches into a fixtures module for a type. */
export type OpenLeg = typeof pendingSettlements.$inferSelect;

/** One movement already booked, from whichever side it is being counted. */
export interface BookedMovement {
  amountMinor: bigint;
}

export type PaymentState = "unattributed" | "part-attributed" | "attributed";

export class AttributionRefusal extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

function sum(movements: readonly BookedMovement[]): bigint {
  return movements.reduce((total, m) => total + m.amountMinor, 0n);
}

/** How much of this payment has already been attributed to something. */
export function attributedOf(booked: readonly BookedMovement[]): bigint {
  return sum(booked);
}

/** How much of this payment is still free to be attributed. */
export function unattributedOf(
  payment: InboundPayment,
  booked: readonly BookedMovement[],
): bigint {
  const left = payment.amountMinor - attributedOf(booked);
  return left > 0n ? left : 0n;
}

/**
 * The payment's state, derived. Note there is no `parked` here: parking is a
 * person putting their name and a note against money that is still
 * unattributed, not a different kind of money.
 */
export function paymentState(
  payment: InboundPayment,
  booked: readonly BookedMovement[],
): PaymentState {
  const attributed = attributedOf(booked);
  if (attributed <= 0n) return "unattributed";
  if (attributed >= payment.amountMinor) return "attributed";
  return "part-attributed";
}

/**
 * What this leg still needs.
 *
 * THIS IS A DIFFERENT GUARD FROM THE ONE THAT EXISTS, and the difference is
 * the whole of FIX A. Before part payments, "has this leg settled?" was a
 * yes/no question answered by a unique index. With them it is an amount, and
 * getting it wrong in either direction is a money defect: too strict and a
 * legitimate remainder is refused, too loose and the ledger shows money the
 * bank does not hold.
 */
export function outstandingOn(
  leg: OpenLeg,
  bookedAgainstLeg: readonly BookedMovement[],
): bigint {
  const left = leg.amountMinor - sum(bookedAgainstLeg);
  return left > 0n ? left : 0n;
}

export interface AttributionFacts {
  payment: InboundPayment;
  /** Movements already booked against THIS PAYMENT's rail reference. */
  bookedAgainstPayment: readonly BookedMovement[];
  leg: OpenLeg;
  /** Movements already booked against THIS LEG. */
  bookedAgainstLeg: readonly BookedMovement[];
  /** The leg's own currency, so a cross-currency attribution cannot happen. */
  legCurrency?: string;
}

/**
 * MAY THIS AMOUNT OF THIS PAYMENT BE ATTRIBUTED TO THIS LEG?
 *
 * Returns the refusal, or null when it may. Deliberately not a throw: the
 * screen needs the reason to render it beside the control, and the server
 * needs the same answer to refuse a request that never touched the screen.
 * Both call this.
 */
export function refuseAttribution(
  facts: AttributionFacts,
  amountMinor: bigint,
): AttributionRefusal | null {
  const { payment, leg, bookedAgainstPayment, bookedAgainstLeg } = facts;

  if (amountMinor <= 0n) {
    return new AttributionRefusal(
      "attribution-nonpositive",
      "An attribution must move a positive amount.",
    );
  }

  // The rail has not finished with it. "Not yet" is not "no" — it stays in the
  // queue — but it is certainly not "book it".
  if (payment.status !== "complete") {
    return new AttributionRefusal(
      "attribution-payment-not-complete",
      payment.status === "pending"
        ? "The rail has not confirmed this payment yet. It will become attributable when it does."
        : "The rail's record says this payment failed. There is no money to attribute.",
    );
  }

  // E1 — one payment is spent exactly once, ever. The database enforces this
  // too, through the unique index on evidence_ref; this exists so ops is told
  // why rather than shown a constraint violation.
  const free = unattributedOf(payment, bookedAgainstPayment);
  if (free <= 0n) {
    return new AttributionRefusal(
      "attribution-payment-spent",
      "Every penny of this payment has already been attributed. One payment settles one thing, once.",
    );
  }
  if (amountMinor > free) {
    return new AttributionRefusal(
      "attribution-exceeds-payment",
      `This payment has ${minor(free)} left to attribute; ${minor(amountMinor)} was asked for.`,
    );
  }

  // E3 — nothing left for the money to pay.
  if (leg.status === "settled") {
    return new AttributionRefusal(
      "attribution-leg-settled",
      "This leg is already settled — there is nothing left for this money to pay.",
    );
  }
  if (leg.status === "failed") {
    return new AttributionRefusal(
      "attribution-leg-failed",
      "This leg failed and was resolved. Start a new one rather than attributing money to a closed attempt.",
    );
  }

  // E2 — never more than what is outstanding.
  const owing = outstandingOn(leg, bookedAgainstLeg);
  if (owing <= 0n) {
    return new AttributionRefusal(
      "attribution-leg-covered",
      "This leg is already fully covered by movements that have booked.",
    );
  }
  if (amountMinor > owing) {
    return new AttributionRefusal(
      "attribution-exceeds-outstanding",
      `This leg has ${minor(owing)} outstanding; ${minor(amountMinor)} was asked for. Attribute the remainder to something else rather than overpaying this one.`,
    );
  }

  if (facts.legCurrency && facts.legCurrency !== payment.currency) {
    return new AttributionRefusal(
      "attribution-wrong-currency",
      `This payment is in ${payment.currency} and the leg is in ${facts.legCurrency}. This demo does not convert.`,
    );
  }

  return null;
}

/**
 * The amount a full attribution would move: whichever is smaller, what the
 * payment has left or what the leg still needs. A part payment falls out of
 * this rather than being a separate mode — which is why the screen has one
 * action and not two.
 */
export function attributableAmount(facts: AttributionFacts): bigint {
  const free = unattributedOf(facts.payment, facts.bookedAgainstPayment);
  const owing = outstandingOn(facts.leg, facts.bookedAgainstLeg);
  const lower = free < owing ? free : owing;
  return lower > 0n ? lower : 0n;
}

/**
 * Would this attribution leave a remainder on the PAYMENT? That remainder is
 * what lands in the `unapplied` account, and saying so before anything books
 * is what the confirm dialog exists for.
 */
export function remainderAfter(
  facts: AttributionFacts,
  amountMinor: bigint,
): bigint {
  const free = unattributedOf(facts.payment, facts.bookedAgainstPayment);
  const left = free - amountMinor;
  return left > 0n ? left : 0n;
}

/** Minor units as a readable amount, for refusal sentences only. Display goes
 *  through the Amount component; this is for text a person reads in an error. */
function minor(v: bigint): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${neg ? "−" : ""}${whole}.${frac}`;
}

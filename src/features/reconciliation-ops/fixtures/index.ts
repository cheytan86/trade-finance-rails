// The barrel. One import for the whole synthetic world.
//
// Nothing in this folder imports a database client — fixtures are typed from
// the schema's row types and the rail's contract, and that is all.

export * from "./payments.ts";
export * from "./legs.ts";

import {
  UNATTRIBUTED_100,
  SPENT_100,
  PART_PAYMENT_FIRST,
  PART_PAYMENT_SECOND,
  ORPHAN_50K,
} from "./payments.ts";
import {
  LEG_AWAITING_100,
  LEG_ALSO_AWAITING_100,
  LEG_TAKING_PART_PAYMENTS,
  LEG_ALREADY_SETTLED,
} from "./legs.ts";

/**
 * THE FIVE EVAL CASES, wired to their material, so a case cannot drift from
 * the data that proves it. Design rows: `docs/product/reconciliation-ops/design.md`.
 */
export const EVAL_SETUP = {
  /** 1 · happy path. A stuck deal and the money that belongs to it. */
  positive: {
    payment: UNATTRIBUTED_100,
    leg: LEG_AWAITING_100,
    expect: "books the repayment; the deal advances past `disbursed`",
  },
  /** 2 · part payment. 200 then 120 against a leg expecting 320. */
  partPayment: {
    payments: [PART_PAYMENT_FIRST, PART_PAYMENT_SECOND],
    leg: LEG_TAKING_PART_PAYMENTS,
    expect: "remainder sits in `unapplied`; client_collections nets to zero",
  },
  /** 3 · ambiguous. One payment, two legs wanting the same amount. */
  ambiguous: {
    payment: UNATTRIBUTED_100,
    candidates: [LEG_AWAITING_100, LEG_ALSO_AWAITING_100],
    expect: "both shown, neither ranked; nothing books until a person picks",
  },
  /** 4 · no target. It should STAY unattributed — that is the pass. */
  orphan: {
    payment: ORPHAN_50K,
    candidates: [] as const,
    expect: "stays visible and unbooked, with an age and an owner",
  },
  /** 5 · the refusals. One payment spent twice; money onto a settled deal. */
  refusals: {
    alreadySpent: { payment: SPENT_100, leg: LEG_AWAITING_100 },
    settledDeal: { payment: UNATTRIBUTED_100, leg: LEG_ALREADY_SETTLED },
    overApplied: { payment: UNATTRIBUTED_100, leg: LEG_TAKING_PART_PAYMENTS },
    expect: "each refused with a named reason, AT THE SERVER; nothing books",
  },
} as const;

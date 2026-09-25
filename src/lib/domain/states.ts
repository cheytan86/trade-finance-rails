// The cycle-0 state model, exactly as designed (design.md §3): five states,
// ops moves everything after submission, refused and disbursed are terminal.
// The full machine (matured-unpaid, holds, reversals) is later-cycle design.

export const INVOICE_STATUSES = [
  "submitted",
  "returned",
  "approved",
  "refused",
  "priced",
  "funded",
  "disbursed",
  "repaid",
  "settled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  // Trade validation's three outcomes. `returned` is the machine's only
  // two-way edge: the supplier corrects the document and resubmits, and the
  // deal is validated again from scratch. Return exists ONLY here — a problem
  // found after approval is a refusal or a reversal, never a quiet bounce,
  // so `approved` and `priced` stay a true record of what was decided.
  submitted: ["approved", "returned", "refused"],
  returned: ["submitted"],
  // The ops pipeline: decide, then price, then fund. Pricing is its own step
  // (Chetan 2026-09-08) — and the slot cycle 7's limit check drops into.
  approved: ["priced"],
  priced: ["funded"],
  refused: [], // terminal — the correction path is a new submission
  funded: ["disbursed"],
  // cycle 1 — the deal's back half (design §3). `repaid` is entered by the
  // debtor's VERIFIED payment, not by a click; `settled` when payout and
  // residual have both booked, in either order.
  disbursed: ["repaid"],
  repaid: ["settled"],
  settled: [], // terminal — the deal is finished
};

export class StateError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Refusals name the failing rule — never a bare "not allowed". */
/** What each destination requires — used to explain a refusal in the operator's
 *  own terms rather than as an abstract state error. */
const REQUIRES: Partial<Record<InvoiceStatus, { from: InvoiceStatus; because: string }>> = {
  returned: { from: "submitted", because: "only a deal awaiting validation can be returned" },
  priced: { from: "approved", because: "only an approved deal can be priced" },
  funded: { from: "priced", because: "only a priced deal can be funded" },
  disbursed: { from: "funded", because: "only a funded invoice can be disbursed" },
  repaid: { from: "disbursed", because: "only a disbursed invoice can be repaid" },
  settled: { from: "repaid", because: "a deal settles only after repayment" },
};

export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (canTransition(from, to)) return;

  // Terminal wins: "settled is terminal" is truer than "not yet repaid".
  if (TRANSITIONS[from].length === 0) {
    throw new StateError(`state-${from}-to-${to}`, `${from} is terminal`);
  }
  // A returned deal is alive but waiting on the supplier — say that, rather
  // than talking about states the operator did not choose.
  if (from === "returned") {
    throw new StateError(
      `state-${from}-to-${to}`,
      "this deal was returned to the supplier for correction — it re-enters validation when they resubmit",
    );
  }
  // The most common operator mistake deserves the most useful sentence.
  if (to === "funded" && from === "approved") {
    throw new StateError(
      `state-${from}-to-${to}`,
      "this deal is approved but not yet priced — set its rate card first",
    );
  }
  const rule = REQUIRES[to];
  throw new StateError(
    `state-${from}-to-${to}`,
    rule
      ? `invoice is ${from}, and ${rule.because}`
      : `${from} → ${to} is not a designed transition`,
  );
}

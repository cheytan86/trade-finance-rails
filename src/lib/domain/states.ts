// The cycle-0 state model, exactly as designed (design.md §3): five states,
// ops moves everything after submission, refused and disbursed are terminal.
// The full machine (matured-unpaid, holds, reversals) is later-cycle design.

export const INVOICE_STATUSES = [
  "submitted",
  "approved",
  "refused",
  "funded",
  "disbursed",
  "repaid",
  "settled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  submitted: ["approved", "refused"],
  approved: ["funded"],
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
export function assertTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (canTransition(from, to)) return;
  // Terminal wins: "disbursed is terminal" is truer than "not approved".
  const why =
    TRANSITIONS[from].length === 0
      ? `${from} is terminal`
      : to === "funded" && from !== "approved"
        ? `invoice is ${from}, and only an approved invoice can be funded`
        : to === "disbursed" && from !== "funded"
          ? `invoice is ${from}, and only a funded invoice can be disbursed`
          : to === "repaid" && from !== "disbursed"
            ? `invoice is ${from}, and only a disbursed invoice can be repaid`
            : to === "settled" && from !== "repaid"
              ? `invoice is ${from}, and a deal settles only after repayment`
              : `${from} → ${to} is not a designed transition`;
  throw new StateError(`state-${from}-to-${to}`, why);
}

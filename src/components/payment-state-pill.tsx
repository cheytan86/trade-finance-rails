// A payment's attribution state, in the host's reserved semantics — no new
// colour is invented.
//
//   --flight  hollow + dashed   money that has arrived and is not yet settled
//             into the ledger. This is EXACTLY what cycle 0 reserved the
//             colour for ("initiated-not-settled") and what cycle 2 recorded
//             as its intended tenant.
//   --good    solid             fully attributed
//   --muted                     the rail itself has not finished, or says the
//                               payment failed — not our state to colour
//
// Deliberately NOT StatusPill: that component carries the INVOICE vocabulary
// (submitted · approved · funded · disbursed · refused) and a payment is not
// an invoice. Borrowing it would make two different things look like one.

const TONE = {
  unattributed: {
    label: "unattributed",
    className:
      "border-[1.5px] border-dashed border-flight text-flight",
    dot: "border-[1.5px] border-flight",
  },
  "part-attributed": {
    label: "part attributed",
    className:
      "border-[1.5px] border-dashed border-flight text-flight",
    dot: "border-[1.5px] border-flight",
  },
  attributed: {
    label: "attributed",
    className: "border-[1.5px] border-good text-good",
    dot: "bg-good border-[1.5px] border-good",
  },
  pending: {
    label: "rail pending",
    className: "border-[1.5px] border-line text-muted",
    dot: "border-[1.5px] border-line",
  },
  failed: {
    label: "rail says failed",
    className: "border-[1.5px] border-line text-muted",
    dot: "border-[1.5px] border-line",
  },
} as const;

export type PaymentTone = keyof typeof TONE;

export function PaymentStatePill({ tone }: { tone: PaymentTone }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.className}`}
    >
      <i className={`h-[5px] w-[5px] rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}

/**
 * How long a payment has been sitting, in the plainest possible form.
 *
 * NO COLOUR, deliberately. Age is a fact, not a judgement: deposit 5ec3e2b9
 * has been unattributed since 2026-09-15 and that is CORRECT — it matches no
 * deal on this rail and forcing it onto one would be the defect. Colouring it
 * red would tell ops to act on money they should leave alone.
 *
 * KNOWN LIMITATION, stated rather than hidden: this measures from the rail's
 * own `createDate` — when the BANK moved the money — not from when this
 * product first saw it. Those differ, and the honest number needs a
 * `first_seen_at` we persist ourselves. That is the schema change this cycle
 * still owes; until it lands, the label says "arrived" rather than "open",
 * because claiming the second while measuring the first is the shape of defect
 * this project keeps finding.
 */
export function ArrivedAge({ at, now = new Date() }: { at: Date; now?: Date }) {
  const ms = now.getTime() - at.getTime();
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const text = days > 0 ? `${days}d` : hours > 0 ? `${hours}h` : `${Math.max(mins, 0)}m`;
  return (
    <span className="font-mono text-[12.5px] text-muted" title={at.toISOString()}>
      {text}
    </span>
  );
}

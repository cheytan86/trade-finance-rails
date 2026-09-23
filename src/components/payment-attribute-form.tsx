"use client";

// THE HUMAN GATE for attributing a payment.
//
// It copies the pattern of src/components/ui/confirm-dialog.tsx rather than
// reusing it: that component takes an invoiceId and the deals module's
// ActionResult, and it is not on this cycle's allow-list. Copying the pattern
// for a different payload is honest; widening a shared component to fit is how
// a design system rots.
//
// THE RULE IT ENFORCES, unchanged since cycle 0: the browser posts a DECISION,
// never a result. This form sends a payment reference, a leg id and an amount.
// Every figure shown below was computed on the server, and the action
// recomputes all of it before booking — so what is displayed can never be what
// is trusted.

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import { formatMinor } from "@/lib/money";
import { attributePayment, type AttributionResult } from "@/lib/reconciliation/actions";

export interface DisplayEntry {
  label: string;
  amountMinor: string;
}

const REASONS = [
  { value: "payer-confirmed", label: "The payer confirmed it" },
  { value: "supplier-confirmed", label: "The supplier confirmed it" },
  { value: "earliest-maturity", label: "Earliest maturity, unresolved" },
  { value: "other", label: "Other" },
] as const;

export function PaymentAttributeForm({
  reference,
  legId,
  legType,
  dealLabel,
  amountMinor,
  entries,
  /** True when more than one leg could take this money. A reason is then
   *  REQUIRED: "ops picked one" is exactly the audit answer this cycle
   *  exists to prevent. */
  reasonRequired,
}: {
  reference: string;
  legId: string;
  legType: string;
  dealLabel: string;
  amountMinor: string;
  entries: DisplayEntry[];
  reasonRequired: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<AttributionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const total = entries.reduce((t, e) => t + BigInt(e.amountMinor), 0n);
  const blocked = reasonRequired && !reason;

  function submit() {
    setResult(null);
    startTransition(async () => {
      const r = await attributePayment({
        reference,
        legId,
        amountMinor,
        reason: reason || undefined,
        note: note || undefined,
      });
      setResult(r);
      if (r.ok) setOpen(false);
    });
  }

  if (!open) {
    return (
      <div>
        <Button onClick={() => setOpen(true)}>Attribute {formatMinor(BigInt(amountMinor))}</Button>
        {result && !result.ok ? (
          <p className="mt-1 text-[12.5px] text-refuse">{result.message}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="text-[15px] font-semibold">Attribute this payment</div>
      <p className="mt-1 text-[13px] text-muted">
        {formatMinor(BigInt(amountMinor))} against the {legType} on {dealLabel}. These are the
        exact entries that will book. Nothing moves until you confirm.
      </p>

      <table className="mt-3 w-full text-[13px]">
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.label}-${i}`}>
              <td className="py-0.5 text-muted">{e.label}</td>
              <td
                className={`py-0.5 text-right font-mono tabular-nums ${
                  BigInt(e.amountMinor) < 0n ? "text-refuse" : "text-good"
                }`}
              >
                {BigInt(e.amountMinor) > 0n ? "+" : ""}
                {formatMinor(BigInt(e.amountMinor))}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line">
            {/* Σ is shown because a movement that does not sum to zero is
                refused by the ledger — showing it is how a person can see
                that before pressing, rather than after. */}
            <td className="pt-1 text-muted">Σ — refused otherwise</td>
            <td className="pt-1 text-right font-mono tabular-nums">{formatMinor(total)}</td>
          </tr>
        </tbody>
      </table>

      <fieldset className="mt-4">
        <legend className="text-[13px] font-medium">
          Why this leg?{" "}
          {reasonRequired ? (
            <span className="text-muted">— required, more than one leg fits</span>
          ) : (
            <span className="text-muted">— optional</span>
          )}
        </legend>
        <div className="mt-1 flex flex-col gap-1">
          {REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-[13px]">
              <input
                type="radio"
                name={`reason-${legId}`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-line bg-surface p-2 text-[13px]"
          rows={2}
          placeholder="Note (optional) — who you spoke to, what they said"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </fieldset>

      {result && !result.ok ? (
        // Inline, beside the control that caused it — never a toast.
        <p className="mt-3 text-[13px] text-refuse">{result.message}</p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={submit} disabled={pending || blocked}>
          {pending ? "Booking…" : "Confirm and book"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
        {blocked ? (
          <span className="text-[12.5px] text-muted">Pick a reason first.</span>
        ) : null}
      </div>
    </div>
  );
}

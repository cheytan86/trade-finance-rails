"use client";

import { useState, useActionState } from "react";
import { Button } from "./button";
import { formatMinor } from "@/lib/money";
import type { ActionResult } from "@/lib/deals/actions";

export interface DialogEntry {
  label: string;
  amountMinor: string; // serialized: bigint cannot cross the server→client boundary
}

/**
 * The human gate. It shows the exact entries about to book — computed on the
 * server — and books nothing until a person confirms. The form posts only the
 * invoice id: the server recomputes every figure at the consequence, so what
 * is displayed can never be what is trusted.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  entries,
  invoiceId,
  action,
  confirmLabel,
  disabled,
  disabledReason,
}: {
  trigger: string;
  title: string;
  description: string;
  entries: DialogEntry[];
  invoiceId: string;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  confirmLabel: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (!result.error) setOpen(false);
      return result;
    },
    {},
  );

  const sum = entries.reduce((acc, e) => acc + BigInt(e.amountMinor), 0n);

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled} title={disabledReason}>
        {trigger}
      </Button>
      {state.error && !open ? (
        <p className="mt-2 text-[12.5px] text-refuse">{state.error}</p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/35 p-6 pt-24"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 mb-3.5 text-[13px] text-muted">{description}</p>

            <div className="rounded-lg border border-line bg-surface">
              {entries.map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b border-line px-3.5 py-2 text-[13.5px] last:border-b-0"
                >
                  <span>{e.label}</span>
                  <span
                    className={
                      BigInt(e.amountMinor) < 0n
                        ? "font-mono text-[13px] tabular-nums text-refuse"
                        : "font-mono text-[13px] tabular-nums text-good"
                    }
                  >
                    {BigInt(e.amountMinor) > 0n ? "+" : ""}
                    {formatMinor(BigInt(e.amountMinor))}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between px-3.5 pt-2 font-mono text-[12px] text-muted">
              <span>Σ entries</span>
              <span>{formatMinor(sum)} — refused otherwise</span>
            </div>

            {state.error ? (
              <p className="mt-3 rounded-lg border border-refuse/30 bg-refuse/5 px-3 py-2 text-[12.5px] text-refuse">
                {state.error}
              </p>
            ) : null}

            <form action={formAction} className="mt-4 flex justify-end gap-2.5">
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Booking…" : confirmLabel}
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

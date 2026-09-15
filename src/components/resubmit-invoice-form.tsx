"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { resubmitInvoice, type ActionResult } from "@/lib/deals/actions";

/**
 * The supplier's answer to a return. Everything is editable (Chetan
 * 2026-09-09) because any field can be the thing ops flagged; resubmitting
 * puts the deal back in the validation queue, checked from scratch.
 */
export function ResubmitInvoiceForm({
  invoiceId,
  note,
  debtors,
  current,
}: {
  invoiceId: string;
  note: string | null;
  debtors: Array<{ id: string; name: string }>;
  current: {
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    description: string;
    debtorId: string;
    faceValue: string;
  };
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    resubmitInvoice,
    {},
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-flight/40 bg-flight/5 p-4">
      <div className="text-[13px] font-semibold text-flight">Returned for correction</div>
      {note ? <p className="mt-1 text-[13px] text-ink">{note}</p> : null}

      {!open ? (
        <Button type="button" variant="secondary" className="mt-3" onClick={() => setOpen(true)}>
          Correct and resubmit…
        </Button>
      ) : (
        <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Invoice number</span>
            <input
              name="invoiceNumber"
              defaultValue={current.invoiceNumber}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Debtor</span>
            <select
              name="debtorId"
              defaultValue={current.debtorId}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
            >
              {debtors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Face value (USD)</span>
            <input
              name="faceValue"
              defaultValue={current.faceValue}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Issue date</span>
            <input
              name="issueDate"
              type="date"
              defaultValue={current.issueDate}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Due date</span>
            <input
              name="dueDate"
              type="date"
              defaultValue={current.dueDate}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] sm:col-span-2">
            <span className="font-medium text-muted">Description of goods or services</span>
            <input
              name="description"
              defaultValue={current.description}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Resubmitting…" : "Resubmit for validation"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {state.error ? (
              <span className="text-[12.5px] text-refuse">{state.error}</span>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

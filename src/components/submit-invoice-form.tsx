"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { submitInvoice, type ActionResult } from "@/lib/deals/actions";

export function SubmitInvoiceForm({
  debtors,
}: {
  debtors: Array<{ id: string; name: string }>;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(submitInvoice, {});

  return (
    <form action={formAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium text-muted">Debtor</span>
        <select
          name="debtorId"
          required
          defaultValue=""
          className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
        >
          <option value="" disabled>
            Choose a debtor…
          </option>
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
          required
          placeholder="48000.00"
          className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium text-muted">Due date</span>
        <input
          name="dueDate"
          type="date"
          required
          className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
        />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px]">
        <span className="font-medium text-muted">Currency</span>
        <input
          className="rounded-lg border border-line bg-surface px-3 py-2 text-[13.5px] text-muted"
          value="USD — fixed in cycle 0"
          disabled
          readOnly
        />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit invoice"}
        </Button>
        {state.error ? <span className="text-[12.5px] text-refuse">{state.error}</span> : null}
      </div>
    </form>
  );
}

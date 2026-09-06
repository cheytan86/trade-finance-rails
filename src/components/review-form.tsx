"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveWithTerms, refuseInvoice, type ActionResult } from "@/lib/deals/actions";

const FIELDS = [
  { name: "advanceRate", label: "Advance rate %", def: "85.00" },
  { name: "supplierRate", label: "Supplier rate % (act/360)", def: "9.50" },
  { name: "funderRate", label: "Funder rate % (act/360)", def: "8.00" },
] as const;

export interface TermsDefaults {
  advanceRate?: string;
  supplierRate?: string;
  funderRate?: string;
  txnCostType?: "fixed" | "percent";
  txnCostValue?: string;
}

export function ReviewForm({
  invoiceId,
  initial = {},
  allowRefuse = true,
  submitLabel = "Approve with these terms",
}: {
  invoiceId: string;
  /** current terms, for re-editing an approved deal (design §3: editable until funding) */
  initial?: TermsDefaults;
  /** refusal is a designed transition only from `submitted` */
  allowRefuse?: boolean;
  submitLabel?: string;
}) {
  const [approveState, approveAction, approving] = useActionState<ActionResult, FormData>(
    approveWithTerms,
    {},
  );
  const [refuseState, refuseAction, refusing] = useActionState<ActionResult, FormData>(
    refuseInvoice,
    {},
  );
  const [showRefuse, setShowRefuse] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <form action={approveAction} className="flex flex-col gap-3">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <label key={f.name} className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium text-muted">{f.label}</span>
              <input
                name={f.name}
                defaultValue={initial[f.name] ?? f.def}
                required
                className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
              />
            </label>
          ))}
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Transaction cost</span>
            <input
              name="txnCostValue"
              defaultValue={initial.txnCostValue ?? "150.00"}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Cost type</span>
            <select
              name="txnCostType"
              defaultValue={initial.txnCostType ?? "fixed"}
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
            >
              <option value="fixed">fixed (amount)</option>
              <option value="percent">percent (of principal)</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={approving}>
            {approving ? "Saving…" : submitLabel}
          </Button>
          {allowRefuse ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setShowRefuse((v) => !v)}
              disabled={approving}
            >
              Refuse…
            </Button>
          ) : null}
          {approveState.error ? (
            <span className="text-[12.5px] text-refuse">{approveState.error}</span>
          ) : null}
        </div>
      </form>

      {allowRefuse && showRefuse ? (
        <form action={refuseAction} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">
              Reason — a refusal names its rule, and this stays on the deal
            </span>
            <input
              name="reason"
              required
              placeholder="Face value exceeds the supplier's demo eligibility cap (rule demo-cap-01)."
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="danger" disabled={refusing}>
              {refusing ? "Refusing…" : "Refuse this invoice"}
            </Button>
            {refuseState.error ? (
              <span className="text-[12.5px] text-refuse">{refuseState.error}</span>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

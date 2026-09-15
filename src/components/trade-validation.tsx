"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  approveInvoice,
  returnForCorrection,
  refuseInvoice,
  type ActionResult,
} from "@/lib/deals/actions";

/**
 * Step 1 of the ops pipeline. Ops decides while LOOKING at the invoice — the
 * document facts are rendered beside the three outcomes, because approving a
 * deal you cannot see is not a decision (Chetan 2026-09-09).
 *
 * Three outcomes: approve · return for corrections (alive, waiting on the
 * supplier) · reject (terminal). Return exists only here.
 */
export function TradeValidation({
  invoiceId,
  document,
}: {
  invoiceId: string;
  document: Array<{ label: string; value: string; wide?: boolean }>;
}) {
  const [approveState, approveAction, approving] = useActionState<ActionResult, FormData>(
    approveInvoice,
    {},
  );
  const [returnState, returnAction, returning] = useActionState<ActionResult, FormData>(
    returnForCorrection,
    {},
  );
  const [refuseState, refuseAction, refusing] = useActionState<ActionResult, FormData>(
    refuseInvoice,
    {},
  );
  const [open, setOpen] = useState<"none" | "return" | "refuse">("none");
  const busy = approving || returning || refusing;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
        {document.map((d) => (
          <div
            key={d.label}
            className={`flex justify-between gap-4 border-b border-line/60 pb-1.5 ${d.wide ? "sm:col-span-2" : ""}`}
          >
            <dt className="text-muted">{d.label}</dt>
            <dd className="text-right font-medium">{d.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-[12.5px] text-muted">
        Check the document before deciding. Approving accepts this receivable for financing;
        pricing is the next step. Returning sends it back to the supplier to fix — the deal stays
        alive. Rejecting is final.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <form action={approveAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Button type="submit" disabled={busy}>
            {approving ? "Approving…" : "Approve"}
          </Button>
        </form>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => setOpen(open === "return" ? "none" : "return")}
        >
          Return for corrections…
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => setOpen(open === "refuse" ? "none" : "refuse")}
        >
          Reject…
        </Button>
        {approveState.error ? (
          <span className="text-[12.5px] text-refuse">{approveState.error}</span>
        ) : null}
      </div>

      {open === "return" ? (
        <form action={returnAction} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">
              What needs correcting? The supplier sees this note and acts on it.
            </span>
            <input
              name="note"
              required
              placeholder="Due date is before the issue date — please check the payment terms."
              className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
            />
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="secondary" disabled={returning}>
              {returning ? "Returning…" : "Return to supplier"}
            </Button>
            {returnState.error ? (
              <span className="text-[12.5px] text-refuse">{returnState.error}</span>
            ) : null}
          </div>
        </form>
      ) : null}

      {open === "refuse" ? (
        <form action={refuseAction} className="flex flex-col gap-2 border-t border-line pt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">
              Reason — a rejection names its rule, and this stays on the deal for good
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
              {refusing ? "Rejecting…" : "Reject this invoice"}
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

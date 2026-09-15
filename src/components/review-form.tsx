"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { approveInvoice, refuseInvoice, type ActionResult } from "@/lib/deals/actions";

/**
 * Step 1 of the ops pipeline: the credit/eligibility DECISION, and nothing
 * else. Rates live in the pricing step (Chetan 2026-09-08) — separating them
 * keeps "should we finance this?" apart from "at what price?", and leaves the
 * slot cycle 7's limit check drops into.
 */
export function ReviewForm({ invoiceId }: { invoiceId: string }) {
  const [approveState, approveAction, approving] = useActionState<ActionResult, FormData>(
    approveInvoice,
    {},
  );
  const [refuseState, refuseAction, refusing] = useActionState<ActionResult, FormData>(
    refuseInvoice,
    {},
  );
  const [showRefuse, setShowRefuse] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        Approve to accept this receivable for financing. Pricing is the next step — no rates are
        set here.
      </p>

      <div className="flex items-center gap-3">
        <form action={approveAction}>
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Button type="submit" disabled={approving || refusing}>
            {approving ? "Approving…" : "Approve"}
          </Button>
        </form>
        <Button
          type="button"
          variant="danger"
          onClick={() => setShowRefuse((v) => !v)}
          disabled={approving}
        >
          Refuse…
        </Button>
        {approveState.error ? (
          <span className="text-[12.5px] text-refuse">{approveState.error}</span>
        ) : null}
      </div>

      {showRefuse ? (
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

"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkSettlementStatus } from "@/lib/deals/actions";
import type { ActionResult } from "@/lib/deals/actions";

/**
 * The control cycle 1's error message has been promising since it was written.
 * `usdc.ts` refuses an unconfirmed transfer with "use Check status to verify it
 * again" — and until now no such control existed anywhere in the repository.
 *
 * It re-asks the rail; it never re-sends. The money has already moved (or has
 * not), and pressing this cannot move it again.
 */
export function CheckStatusButton({ pendingId }: { pendingId: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    async (prev, fd) => checkSettlementStatus(prev, fd),
    {},
  );
  return (
    <form action={formAction}>
      <input type="hidden" name="pendingId" value={pendingId} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Checking…" : "Check status"}
      </Button>
      {state.error ? <p className="mt-2 text-[12.5px] text-refuse">{state.error}</p> : null}
    </form>
  );
}

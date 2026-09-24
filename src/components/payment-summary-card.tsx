// THE MONEY-RECEIVED CARD on the ops deal book — and its own loading state.
//
// WHY IT IS ITS OWN COMPONENT. This card is the only thing on /ops that makes
// a network call. Fetching it inline made the whole deal book — the busiest
// screen in the product — wait on Circle before rendering a single row. Found
// at Deploy D7, 2026-09-24: a click took about two seconds with nothing on
// screen, because there is no loading state anywhere in this application and a
// server component renders nothing until it has everything.
//
// Split out and wrapped in Suspense, the deal book paints immediately and this
// card fills in behind it. The host's own screens are unchanged: no loading.tsx
// was added at /ops, because that would alter how an existing screen behaves
// for content this cycle did not build.

import Link from "next/link";
import { Card } from "./ui/card";
import { Amount } from "./ui/amount";
import { loadAllQueues } from "@/lib/reconciliation/queue";

/** What the card looks like while the rail is being asked. Same shape and
 *  height as the real thing, so nothing jumps when it arrives. */
export function PaymentSummarySkeleton() {
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="font-medium text-muted">Money received</span>
          <div className="mt-0.5 text-[12.5px] text-muted">
            Asking the rails what has arrived…
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[19px] tabular-nums text-muted">—</div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted">
            unattributed
          </div>
        </div>
      </div>
    </Card>
  );
}

export async function PaymentSummaryCard() {
  let unattributed: { count: number; minor: bigint } | null = null;
  let railReachable = true;

  try {
    // Every rail that can receive money, summed. Rails with no outside
    // contribute nothing rather than being excluded by name.
    const queues = await loadAllQueues();
    let count = 0;
    let minor = 0n;
    let anyOk = false;
    for (const q of queues) {
      // A rail we could not reach makes the WHOLE total untrustworthy, so the
      // card says so rather than quoting a figure that silently omits whatever
      // that rail was holding.
      if (q.status === "unreachable") railReachable = false;
      if (q.status !== "ok") continue;
      anyOk = true;
      count += q.totals.unattributedCount;
      minor += q.totals.unattributedMinor;
    }
    if (anyOk) unattributed = { count, minor };
  } catch {
    railReachable = false;
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link className="font-medium hover:text-cobalt" href="/ops/payments">
            Money received →
          </Link>
          <div className="mt-0.5 text-[12px] text-muted">
            Only rails with an outside can receive money. Deals on demo-internal
            and USDC settle without an inbound payment, so they never appear
            there — the ledger still has every movement.
          </div>
          <div className="mt-0.5 text-[12.5px] text-muted">
            {!railReachable
              ? // NOT "nothing arrived". We could not ask, and saying so is the
                // whole point of this cycle.
                "A rail could not be reached, so we cannot say what has arrived."
              : unattributed === null
                ? "No rail on this deployment receives inbound payments."
                : unattributed.count === 0
                  ? "Every payment the rails hold is attributed."
                  : "Money the ledger cannot yet account for."}
          </div>
        </div>
        {railReachable && unattributed && unattributed.count > 0 ? (
          <div className="text-right">
            <div className="font-mono text-[19px] tabular-nums text-flight">
              <Amount minor={unattributed.minor} />
            </div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted">
              {unattributed.count} unattributed
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { allInvoices, openLegs } from "@/lib/queries";
import { seatGate } from "@/lib/roles/gate";
import { loadAllQueues } from "@/lib/reconciliation/queue";

export const dynamic = "force-dynamic";

export default async function OpsQueue() {
  const gate = await seatGate("ops");
  if (gate) return gate;
  const rows = await allInvoices();
  const inFlight = await openLegs();
  const legCountFor = (invoiceId: string) =>
    inFlight.filter((l) => l.leg.invoiceId === invoiceId).length;
  // cycle 3 — the reconciliation queue's own summary, flag-gated.
  //
  // THIS CALLS THE RAIL, over the network, on a page that has never needed one.
  // So it is wrapped: if Circle is unreachable the ops queue must still render.
  // A deal book that goes dark because a payment API timed out would be a
  // worse defect than the one this cycle is fixing.
  let unattributed: { count: number; minor: bigint } | null = null;
  let railReachable = true;
  if (process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION) {
    try {
      // Every rail that can receive money, summed. Rails with no outside
      // contribute nothing rather than being excluded by name.
      const queues = await loadAllQueues();
      let count = 0;
      let minor = 0n;
      let anySupported = false;
      for (const q of queues) {
        if (!q.supported) continue;
        anySupported = true;
        count += q.totals.unattributedCount;
        minor += q.totals.unattributedMinor;
      }
      if (anySupported) unattributed = { count, minor };
    } catch {
      railReachable = false;
    }
  }

  const awaiting = rows.filter((r) => r.invoice.status === "submitted");
  const rest = rows.filter((r) => r.invoice.status !== "submitted");

  const renderRows = (list: typeof rows) =>
    list.map(({ invoice, supplierName, debtorName }) => (
      <tr key={invoice.id}>
        <Td>
          <Link
            className="font-medium hover:text-cobalt"
            href={`/ops/deals/${invoice.id}`}
          >
            {supplierName} → {debtorName}
          </Link>
        </Td>
        <Td right>
          <Amount minor={invoice.faceValueMinor} />
        </Td>
        <Td className="font-mono text-[12.5px] text-muted">{invoice.dueDate}</Td>
        <Td>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={invoice.status} />
            {legCountFor(invoice.id) > 0 ? (
              // So ops can see what is mid-settlement without opening each deal.
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-flight px-2.5 py-0.5 text-xs font-semibold text-flight">
                <i className="h-[5px] w-[5px] rounded-full border-[1.5px] border-flight" />
                {legCountFor(invoice.id)} leg{legCountFor(invoice.id) > 1 ? "s" : ""} in flight
              </span>
            ) : null}
          </div>
        </Td>
      </tr>
    ));

  return (
    <div className="flex flex-col gap-5">
      {process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION ? (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <Link className="font-medium hover:text-cobalt" href="/ops/payments">
                Money received →
              </Link>
              <div className="mt-0.5 text-[12px] text-muted">
                Only rails with an outside can receive money. Deals on
                demo-internal and USDC settle without an inbound payment, so
                they never appear there — the ledger still has every movement.
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted">
                {!railReachable
                  ? // NOT "nothing arrived". We could not ask, and saying so is
                    // the whole point of this cycle.
                    "The rail could not be reached, so we cannot say what has arrived."
                  : unattributed === null
                    ? "No rail on this deployment receives inbound payments."
                    : unattributed.count === 0
                      ? "Every payment the rail holds is attributed."
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
      ) : null}
      <Card
        title="Awaiting review"
        sub="Submitted deals — review the terms, then approve or refuse with the rule named."
      >
        {awaiting.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing waiting. A supplier submission lands here the moment it happens.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Deal</Th>
                <Th right>Face value</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>{renderRows(awaiting)}</tbody>
          </Table>
        )}
      </Card>
      <Card title="All deals" sub="The whole book, every state.">
        <Table>
          <thead>
            <tr>
              <Th>Deal</Th>
              <Th right>Face value</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>{renderRows(rest)}</tbody>
        </Table>
      </Card>
    </div>
  );
}

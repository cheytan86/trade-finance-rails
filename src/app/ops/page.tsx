import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { allInvoices, openLegs } from "@/lib/queries";
import { seatGate } from "@/lib/roles/gate";

export const dynamic = "force-dynamic";

export default async function OpsQueue() {
  const gate = await seatGate("ops");
  if (gate) return gate;
  const rows = await allInvoices();
  const inFlight = await openLegs();
  const legCountFor = (invoiceId: string) =>
    inFlight.filter((l) => l.leg.invoiceId === invoiceId).length;
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

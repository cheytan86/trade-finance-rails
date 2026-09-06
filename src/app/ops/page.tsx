import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { allInvoices } from "@/lib/queries";
import { seatGate } from "@/lib/roles/gate";

export const dynamic = "force-dynamic";

export default async function OpsQueue() {
  const gate = await seatGate("ops");
  if (gate) return gate;
  const rows = await allInvoices();
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
          <StatusPill status={invoice.status} />
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

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { demoSupplier, invoicesForSupplier } from "@/lib/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const supplier = await demoSupplier();
  const rows = await invoicesForSupplier(supplier.id);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        Acting as <span className="font-semibold text-ink">{supplier.name}</span> — the demo
        supplier seat.
      </p>

      <Card
        title="New invoice"
        sub="Submitting places this deal in platform ops's review queue."
      >
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Debtor</span>
            <select className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]" disabled>
              <option>Wired in the human-gates prompt (A5)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Face value (USD)</span>
            <input
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
              placeholder="48,000.00"
              disabled
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">Due date</span>
            <input
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
              placeholder="2026-11-05"
              disabled
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
          <div className="sm:col-span-2">
            <Button disabled title="Submission is wired in prompt A5 — the live trigger">
              Submit invoice
            </Button>
          </div>
        </form>
      </Card>

      <Card
        title="Your invoices"
        sub="Only this supplier's book — role isolation becomes an enforced, tested property at A4."
      >
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted">No invoices yet — submit one above.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Debtor</Th>
                <Th right>Face value</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ invoice, debtorName }) => (
                <tr key={invoice.id}>
                  <Td>
                    <Link className="hover:text-cobalt" href={`/ops/deals/${invoice.id}`}>
                      {debtorName}
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
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

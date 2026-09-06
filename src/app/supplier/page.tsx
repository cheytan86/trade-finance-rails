import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { allSuppliers, invoicesForSupplier } from "@/lib/queries";
import { getIdentity } from "@/lib/roles/identity";
import { seatGate } from "@/lib/roles/gate";
import { actAsSupplier } from "@/lib/roles/actions";
import { cn } from "@/lib/cn";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const gate = await seatGate("supplier");
  if (gate) return gate;
  const [identity, suppliers] = await Promise.all([getIdentity(), allSuppliers()]);
  const supplier = suppliers.find((s) => s.id === identity?.partyId) ?? suppliers[0];
  const rows = await invoicesForSupplier(supplier.id);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[13px] text-muted">
          Acting as <span className="font-semibold text-ink">{supplier.name}</span>
        </p>
        <div className="flex rounded-lg border border-line bg-surface p-[2px]">
          {suppliers.map((s) => (
            <form key={s.id} action={actAsSupplier}>
              <input type="hidden" name="partyId" value={s.id} />
              <button
                type="submit"
                className={cn(
                  "rounded-md px-2.5 py-0.5 text-[12px] transition-colors",
                  s.id === supplier.id
                    ? "bg-card font-semibold text-ink shadow-card"
                    : "text-muted hover:text-ink",
                )}
              >
                {s.name.split(" ")[0]}
              </button>
            </form>
          ))}
        </div>
        <span className="text-[11.5px] text-muted">
          — switch and the book below changes with you; the other supplier&apos;s deals never
          render here.
        </span>
      </div>

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

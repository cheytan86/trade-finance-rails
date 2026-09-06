import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { allSuppliers, allDebtors, invoicesForSupplier, resolvePartyForSeat } from "@/lib/queries";
import { SubmitInvoiceForm } from "@/components/submit-invoice-form";
import { getIdentity } from "@/lib/roles/identity";
import { seatGate } from "@/lib/roles/gate";
import { actAsSupplier } from "@/lib/roles/actions";
import { cn } from "@/lib/cn";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SupplierPage() {
  const gate = await seatGate("supplier");
  if (gate) return gate;
  const [identity, suppliers, debtors] = await Promise.all([
    getIdentity(),
    allSuppliers(),
    allDebtors(),
  ]);
  // Same resolution the submit action uses — screen and write cannot disagree.
  const supplier = await resolvePartyForSeat("supplier", identity?.partyId);
  if (!supplier) {
    return <p className="text-[13px] text-muted">No suppliers exist — run the seed script.</p>;
  }
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
        <SubmitInvoiceForm debtors={debtors} />
      </Card>

      <Card
        title="Your invoices"
        sub="Only this supplier's book — enforced by the identity seam, not by a filter."
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

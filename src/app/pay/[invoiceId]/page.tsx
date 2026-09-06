import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { invoiceDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

// PUBLIC surface, no role required — an invoice payment link is public in the
// real world. Cycle 0 ships the stub; the actual payment mechanics arrive
// with the settlement rails (cycles 1–3).
export default async function PayPage({ params }: PageProps<"/pay/[invoiceId]">) {
  const { invoiceId } = await params;
  const row = await invoiceDetail(invoiceId).catch(() => undefined);
  if (!row) notFound();
  const { invoice, supplierName, debtorName } = row;

  return (
    <div className="mx-auto max-w-md">
      <Card title="Invoice payment" sub={`For the attention of ${debtorName}.`}>
        <dl className="flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex justify-between">
            <dt className="text-muted">Payee</dt>
            <dd className="font-medium">{supplierName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Amount due</dt>
            <dd>
              <Amount minor={invoice.faceValueMinor} /> {invoice.currency}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Due date</dt>
            <dd className="font-mono text-[12.5px]">{invoice.dueDate}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Reference</dt>
            <dd className="font-mono text-[12.5px]">{invoice.id.slice(0, 8)}</dd>
          </div>
        </dl>
        <div className="mt-5 rounded-lg border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
          Payment on this surface arrives with the settlement rails (cycle 1 onward) —
          repayment is not part of the cycle-0 spine. <ProvenanceBadge>demo</ProvenanceBadge>
        </div>
      </Card>
    </div>
  );
}

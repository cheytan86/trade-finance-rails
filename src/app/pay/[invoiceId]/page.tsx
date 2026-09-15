import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { invoiceDetail, movementsForInvoice, accountRefsFor } from "@/lib/queries";
import { PayInvoiceForm } from "@/components/pay-invoice-form";
import { repaymentEntries } from "@/lib/deals/preview";
import { daysLateBetween } from "@/lib/pricing/overdue";

export const dynamic = "force-dynamic";

// PUBLIC surface, no seat required — an invoice payment link is public in the
// real world, and its gate is the confirmation dialog itself.
export default async function PayPage({ params }: PageProps<"/pay/[invoiceId]">) {
  const { invoiceId } = await params;
  const row = await invoiceDetail(invoiceId).catch(() => undefined);
  if (!row) notFound();
  const { invoice, supplierName, debtorName } = row;

  const movements = await movementsForInvoice(invoiceId);
  const repayment = movements.find((m) => m.type === "repayment");
  const refs = await accountRefsFor(invoice.supplierId);
  const debtorCash = refs.debtorCash?.[invoice.debtorId];

  const payable = invoice.status === "disbursed" && debtorCash && refs.treasury;
  const entries = payable
    ? repaymentEntries(invoice.faceValueMinor, {
        debtorCash: debtorCash!,
        treasury: refs.treasury!,
      }).map((e) => ({ label: e.label, amountMinor: e.amountMinor.toString() }))
    : [];

  const daysPastDue = repayment ? 0 : daysLateBetween(invoice.dueDate, new Date());

  return (
    <div className="mx-auto max-w-md">
      <Card title="Invoice payment" sub={`For the attention of ${debtorName}.`}>
        <dl className="flex flex-col gap-2.5 text-[13.5px]">
          <div className="flex justify-between">
            <dt className="text-muted">Payee</dt>
            <dd className="font-medium">{supplierName}</dd>
          </div>
          {invoice.invoiceNumber ? (
            <div className="flex justify-between">
              <dt className="text-muted">Invoice</dt>
              <dd className="font-mono text-[12.5px]">{invoice.invoiceNumber}</dd>
            </div>
          ) : null}
          {invoice.description ? (
            <div className="flex justify-between gap-6">
              <dt className="text-muted">For</dt>
              <dd className="text-right">{invoice.description}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted">Amount due</dt>
            <dd>
              <Amount minor={invoice.faceValueMinor} /> {invoice.currency}
            </dd>
          </div>
          {invoice.issueDate ? (
            <div className="flex justify-between">
              <dt className="text-muted">Issued</dt>
              <dd className="font-mono text-[12.5px]">{invoice.issueDate}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted">Due date</dt>
            <dd className="font-mono text-[12.5px]">{invoice.dueDate}</dd>
          </div>
        </dl>

        {daysPastDue > 0 && payable ? (
          <p className="mt-4 rounded-lg border border-flight/40 bg-flight/5 px-3 py-2 text-[12.5px] text-flight">
            {daysPastDue} {daysPastDue === 1 ? "day" : "days"} past due. The amount you owe is
            unchanged — overdue interest is settled between the platform, the funder and the
            supplier, not added to your bill.
          </p>
        ) : null}

        <div className="mt-5">
          {repayment ? (
            <div className="rounded-lg border border-good/30 bg-good/5 px-3.5 py-3 text-[13px] text-good">
              <div className="font-semibold">Paid — thank you.</div>
              <div className="mt-1.5">
                {repayment.evidenceKind === "tx-hash" ? (
                  <ProvenanceBadge href={`https://sepolia.basescan.org/tx/${repayment.evidenceRef}`}>
                    {repayment.evidenceRef.slice(0, 10)}…{repayment.evidenceRef.slice(-6)}
                  </ProvenanceBadge>
                ) : (
                  <ProvenanceBadge>{repayment.evidenceKind}</ProvenanceBadge>
                )}
              </div>
            </div>
          ) : payable ? (
            <>
              <PayInvoiceForm
                invoiceId={invoice.id}
                entries={entries}
                onChain={invoice.rail === "usdc"}
              />
              <p className="mt-2.5 text-[12px] text-muted">
                {invoice.rail === "usdc"
                  ? "Pays in testnet USDC from the debtor demo wallet. Nothing is recorded until the transfer is verified on-chain."
                  : "Records payment against this invoice."}{" "}
                Exact amount only — a part payment is refused until the reconciliation cycle
                handles it.
              </p>
            </>
          ) : (
            <div className="rounded-lg border border-line bg-surface px-3.5 py-3 text-[12.5px] text-muted">
              This invoice is not open for payment yet (it is {invoice.status}). A deal becomes
              payable once the supplier has been paid. <ProvenanceBadge>demo</ProvenanceBadge>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

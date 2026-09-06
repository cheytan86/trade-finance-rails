import { redirect } from "next/navigation";
import { latestPayableInvoiceId } from "@/lib/queries";

export const dynamic = "force-dynamic";

// The debtor has no dashboard — a payment link is per-invoice, as in reality.
// The role switch's "Debtor" entry lands here and forwards to the most recent
// deal's public payment page.
export default async function PayIndex() {
  const id = await latestPayableInvoiceId();
  if (id) redirect(`/pay/${id}`);
  return (
    <p className="text-[13px] text-muted">
      No invoices exist yet, so there is no payment link to show. Seed the demo or submit an
      invoice first.
    </p>
  );
}

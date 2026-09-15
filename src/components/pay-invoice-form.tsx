"use client";

import { ConfirmDialog, type DialogEntry } from "@/components/ui/confirm-dialog";
import { repayInvoice } from "@/lib/deals/actions";

/**
 * The debtor's gate. Public — a payment link needs no account, exactly as an
 * invoice payment link is public in the real world. The amount is always the
 * face value: overdue interest is settled between the platform, the funder
 * and the supplier's residual, so this number never moves.
 */
export function PayInvoiceForm({
  invoiceId,
  entries,
  onChain,
}: {
  invoiceId: string;
  entries: DialogEntry[];
  onChain: boolean;
}) {
  return (
    <ConfirmDialog
      trigger="Pay this invoice"
      title="Confirm payment"
      description={
        onChain
          ? "Sends the face value in testnet USDC from the debtor demo wallet on Base Sepolia. Nothing is recorded until the transfer is verified on-chain."
          : "Records the debtor's payment of the face value against this invoice."
      }
      entries={entries}
      invoiceId={invoiceId}
      action={repayInvoice}
      confirmLabel="Confirm — pay the invoice"
    />
  );
}

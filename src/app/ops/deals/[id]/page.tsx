import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { DealTimeline } from "@/components/deal-timeline";
import { invoiceDetail, movementsForInvoice, accountRefsFor } from "@/lib/queries";
import { parseSnapshot, computePricing } from "@/lib/pricing";
import { seatGate } from "@/lib/roles/gate";
import { ReviewForm } from "@/components/review-form";
import { ConfirmDialog, type DialogEntry } from "@/components/ui/confirm-dialog";
import { fundInvoice, disburseInvoice } from "@/lib/deals/actions";
import { fundingEntries, disbursementEntries } from "@/lib/deals/preview";

export const dynamic = "force-dynamic";

function fmtBps(bps: number | null): string {
  return bps == null ? "—" : `${(bps / 100).toFixed(2)}%`;
}

export default async function DealPage({ params }: PageProps<"/ops/deals/[id]">) {
  const { id } = await params; // Next 16: params is a Promise
  const gate = await seatGate("ops", `/ops/deals/${id}`);
  if (gate) return gate;
  const row = await invoiceDetail(id).catch(() => undefined);
  if (!row) notFound();
  const { invoice, supplierName, debtorName } = row;
  const movements = await movementsForInvoice(id);
  const snapshot = invoice.pricingSnapshot ? parseSnapshot(invoice.pricingSnapshot) : null;
  const refs = await accountRefsFor(invoice.supplierId);

  // What the gate dialogs will show — same pure functions the actions book
  // with, so the confirmation cannot drift from the consequence. bigints are
  // serialized because they cannot cross into a client component.
  const toDialog = (entries: Array<{ label: string; amountMinor: bigint }>): DialogEntry[] =>
    entries.map((e) => ({ label: e.label, amountMinor: e.amountMinor.toString() }));

  const terms =
    invoice.advanceRateBps != null &&
    invoice.supplierRateBps != null &&
    invoice.funderRateBps != null &&
    invoice.txnCostType != null &&
    invoice.txnCostValue != null
      ? {
          faceValueMinor: invoice.faceValueMinor,
          dueDate: invoice.dueDate,
          advanceRateBps: invoice.advanceRateBps,
          supplierRateBps: invoice.supplierRateBps,
          funderRateBps: invoice.funderRateBps,
          txnCostType: invoice.txnCostType,
          txnCostValue: invoice.txnCostValue,
        }
      : null;

  const fundingPreview =
    invoice.status === "approved" && terms && refs.funderCash && refs.treasury
      ? toDialog(
          fundingEntries(computePricing(terms, new Date()), {
            funderCash: refs.funderCash,
            treasury: refs.treasury,
          }),
        )
      : null;

  const disbursementPreview =
    invoice.status === "funded" &&
    snapshot &&
    refs.treasury &&
    refs.supplierPayable &&
    refs.feeIncome
      ? toDialog(
          disbursementEntries(snapshot, {
            treasury: refs.treasury,
            supplierPayable: refs.supplierPayable,
            feeIncome: refs.feeIncome,
          }),
        )
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            {supplierName} → {debtorName}
          </h1>
          <Amount minor={invoice.faceValueMinor} className="text-[15px]" />
          <StatusPill status={invoice.status} />
        </div>
        <div className="mt-3">
          <DealTimeline status={invoice.status} />
        </div>
        {invoice.status === "refused" && invoice.refusalReason ? (
          <p className="mt-3 rounded-lg border border-refuse/30 bg-refuse/5 px-3 py-2 text-[13px] text-refuse">
            Refused: {invoice.refusalReason}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title="Terms"
          sub={
            snapshot
              ? "Locked as the pricing snapshot the moment funding booked."
              : "Editable until funding — the snapshot locks then."
          }
        >
          <Table>
            <tbody>
              <tr>
                <Td>Advance rate</Td>
                <Td right className="font-mono text-[13px]">{fmtBps(invoice.advanceRateBps)}</Td>
              </tr>
              <tr>
                <Td>Supplier rate (act/360)</Td>
                <Td right className="font-mono text-[13px]">{fmtBps(invoice.supplierRateBps)}</Td>
              </tr>
              <tr>
                <Td>Funder rate (act/360)</Td>
                <Td right className="font-mono text-[13px]">{fmtBps(invoice.funderRateBps)}</Td>
              </tr>
              <tr>
                <Td>Transaction cost</Td>
                <Td right className="font-mono text-[13px]">
                  {invoice.txnCostType === "fixed" && invoice.txnCostValue != null ? (
                    <Amount minor={invoice.txnCostValue} />
                  ) : invoice.txnCostType === "percent" ? (
                    `${fmtBps(Number(invoice.txnCostValue))} of principal`
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
              {snapshot ? (
                <>
                  <tr>
                    <Td>Tenor at funding</Td>
                    <Td right className="font-mono text-[13px]">{snapshot.tenorDays} days</Td>
                  </tr>
                  <tr>
                    <Td>Principal</Td>
                    <Td right><Amount minor={snapshot.principalMinor} /></Td>
                  </tr>
                  <tr>
                    <Td>Supplier disbursement</Td>
                    <Td right><Amount minor={snapshot.supplierDisbursementMinor} /></Td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </Table>
          {invoice.status === "approved" && terms ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-3 text-[12.5px] text-muted">
                Editable until funding locks the snapshot (re-approval, same margin check):
              </p>
              <ReviewForm
                invoiceId={invoice.id}
                allowRefuse={false}
                submitLabel="Update terms"
                initial={{
                  advanceRate: (invoice.advanceRateBps! / 100).toFixed(2),
                  supplierRate: (invoice.supplierRateBps! / 100).toFixed(2),
                  funderRate: (invoice.funderRateBps! / 100).toFixed(2),
                  txnCostType: invoice.txnCostType!,
                  // /100 covers both: fixed is minor units (15000 → 150.00),
                  // percent is bps (50 → 0.50) — same scale, different meaning.
                  txnCostValue: (Number(invoice.txnCostValue) / 100).toFixed(2),
                }}
              />
            </div>
          ) : null}
        </Card>

        <Card title="Gates" sub="Each consequence sits behind its own confirm — decisions, never results.">
          {invoice.status === "submitted" ? (
            <ReviewForm invoiceId={invoice.id} />
          ) : (
            <div className="flex flex-col gap-3.5 text-[13.5px]">
              <div className="flex items-center justify-between">
                <span>Approve / Refuse</span>
                <span className="text-[12px] font-semibold text-muted">
                  {invoice.status === "refused" ? "refused" : "done"}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className={invoice.status !== "approved" ? "text-muted/70" : undefined}>
                  Fund — books the financing leg
                </span>
                {invoice.status === "approved" && fundingPreview ? (
                  <ConfirmDialog
                    trigger="Fund…"
                    title="Confirm funding"
                    description="Records the funder's capital arriving — the funder's own decision surface arrives with the funding-models cycle. These entries book permanently, and the pricing snapshot locks, at this moment."
                    entries={fundingPreview}
                    invoiceId={invoice.id}
                    action={fundInvoice}
                    confirmLabel="Confirm — book funding"
                  />
                ) : (
                  <Button
                    disabled
                    title={
                      invoice.status === "refused"
                        ? "This invoice was refused — refused is terminal."
                        : "Already funded — funding books exactly once."
                    }
                  >
                    Fund…
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className={invoice.status !== "funded" ? "text-muted/70" : undefined}>
                  Disburse — refused until funded
                </span>
                {invoice.status === "funded" && disbursementPreview ? (
                  <ConfirmDialog
                    trigger="Disburse…"
                    title="Confirm disbursement"
                    description="Three entries: the supplier's money and the platform's fees leave the treasury as separate, visible lines."
                    entries={disbursementPreview}
                    invoiceId={invoice.id}
                    action={disburseInvoice}
                    confirmLabel="Confirm — book disbursement"
                  />
                ) : (
                  <Button
                    disabled
                    title={
                      invoice.status === "disbursed"
                        ? "Already disbursed — the end of the cycle-0 spine."
                        : "Only a funded invoice can be disbursed."
                    }
                  >
                    Disburse…
                  </Button>
                )}
              </div>

              <p className="mt-1 text-[12px] text-muted">
                Every figure in a confirmation is recomputed on the server at the moment of the
                consequence — the browser posts the decision, never the amounts.
              </p>
            </div>
          )}
        </Card>
      </div>

      <Card title="Movements" sub="Every movement's entries sum to zero; every event carries its evidence.">
        {movements.length === 0 ? (
          <p className="text-[13px] text-muted">
            Nothing booked yet — the first movement appears when funding is confirmed.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Entries</Th>
                <Th right>Amounts</Th>
                <Th>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.eventId}>
                  <Td className="font-semibold">{m.type}</Td>
                  <Td className="text-[12.5px]">
                    {m.entries.map((e, i) => (
                      <div key={i}>{e.accountLabel}</div>
                    ))}
                  </Td>
                  <Td right>
                    {m.entries.map((e, i) => (
                      <div key={i}>
                        <Amount minor={e.amountMinor} signed />
                      </div>
                    ))}
                  </Td>
                  <Td>
                    <ProvenanceBadge>
                      {m.evidenceKind} · {m.evidenceRef.split(":").pop()}
                    </ProvenanceBadge>
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

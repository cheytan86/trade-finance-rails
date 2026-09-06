import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { DealTimeline } from "@/components/deal-timeline";
import { invoiceDetail, movementsForInvoice } from "@/lib/queries";
import { parseSnapshot } from "@/lib/pricing";

export const dynamic = "force-dynamic";

function fmtBps(bps: number | null): string {
  return bps == null ? "—" : `${(bps / 100).toFixed(2)}%`;
}

export default async function DealPage({ params }: PageProps<"/ops/deals/[id]">) {
  const { id } = await params; // Next 16: params is a Promise
  const row = await invoiceDetail(id).catch(() => undefined);
  if (!row) notFound();
  const { invoice, supplierName, debtorName } = row;
  const movements = await movementsForInvoice(id);
  const snapshot = invoice.pricingSnapshot ? parseSnapshot(invoice.pricingSnapshot) : null;

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
        </Card>

        <Card title="Gates" sub="Each consequence sits behind its own confirm — decisions, never results.">
          <div className="flex flex-col gap-3 text-[13.5px]">
            <div className="flex items-center justify-between">
              <span>Approve / Refuse</span>
              {invoice.status === "submitted" ? (
                <Button disabled title="Gates act in prompt A5">Review…</Button>
              ) : (
                <span className="text-[12px] font-semibold text-muted">
                  {invoice.status === "refused" ? "refused" : "done"}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span>Fund — books the financing leg</span>
              <Button disabled title="Gates act in prompt A5">Fund…</Button>
            </div>
            <div className="flex items-center justify-between">
              <span className={invoice.status !== "funded" ? "text-muted/70" : undefined}>
                Disburse — refused until funded
              </span>
              <Button disabled title="Gates act in prompt A5">Disburse…</Button>
            </div>
            <p className="mt-1 text-[12px] text-muted">
              The buttons act in the human-gates prompt (A5). Every booking they will make shows
              its exact entries first.
            </p>
          </div>
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

import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { DealTimeline } from "@/components/deal-timeline";
import {
  invoiceDetail,
  movementsForInvoice,
  accountRefsFor,
  legsForInvoice,
} from "@/lib/queries";
import { parseSnapshot, computePricing } from "@/lib/pricing";
import { seatGate } from "@/lib/roles/gate";
import { TradeValidation } from "@/components/trade-validation";
import { PricingForm } from "@/components/pricing-form";
import { PricingResults } from "@/components/pricing-results";
import { ConfirmDialog, type DialogEntry } from "@/components/ui/confirm-dialog";
import { InFlightStrip } from "@/components/in-flight-strip";
import { fundInvoice, disburseInvoice, payoutFunder, payResidual } from "@/lib/deals/actions";
import {
  fundingEntries,
  disbursementEntries,
  payoutEntries,
  residualEntries,
} from "@/lib/deals/preview";
import { railFor } from "@/lib/rails";
import { computeOverdue, daysLateBetween } from "@/lib/pricing/overdue";
import { formatMinor } from "@/lib/money";

export const dynamic = "force-dynamic";

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
  const legs = await legsForInvoice(id);

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

  // The breakdown the pricing panel shows: the locked snapshot once funded,
  // otherwise a live estimate whose tenor shrinks daily — the distinction is
  // the point, so the panel labels which one it is rendering.
  const livePricing = snapshot ?? (terms ? computePricing(terms, new Date()) : null);

  const fundingPreview =
    invoice.status === "priced" && terms && refs.funderCash && refs.clientCollections
      ? toDialog(
          fundingEntries(computePricing(terms, new Date()), {
            funderCash: refs.funderCash,
            clientCollections: refs.clientCollections,
          }),
        )
      : null;

  const disbursementPreview =
    invoice.status === "funded" &&
    snapshot &&
    refs.clientCollections &&
    refs.supplierPayable &&
    refs.platformOperating
      ? toDialog(
          disbursementEntries(snapshot, {
            clientCollections: refs.clientCollections,
            supplierPayable: refs.supplierPayable,
            platformOperating: refs.platformOperating,
          }),
        )
      : null;

  // The back half. Overdue is computed from the repayment event's timestamp
  // (the ledger's own record of when money arrived), so payout and residual
  // always show the same numbers the actions will book.
  const repaymentEvent = movements.find((m) => m.type === "repayment");
  const overdue =
    snapshot && invoice.supplierRateBps != null && invoice.funderRateBps != null
      ? computeOverdue({
          principalMinor: snapshot.principalMinor,
          supplierRateBps: invoice.supplierRateBps,
          funderRateBps: invoice.funderRateBps,
          daysLate: daysLateBetween(invoice.dueDate, repaymentEvent?.createdAt ?? new Date()),
          residualMinor: snapshot.supplierResidualMinor,
        })
      : null;

  const paidTypes = new Set(movements.map((m) => m.type));
  const payoutPreview =
    invoice.status === "repaid" &&
    !paidTypes.has("payout") &&
    snapshot &&
    overdue &&
    refs.clientCollections &&
    refs.funderCash
      ? toDialog(
          // Two accounts: the funder's interest never left client money, so
          // there is no platform account to draw it back out of (cycle 2).
          payoutEntries(snapshot, overdue, {
            clientCollections: refs.clientCollections,
            funderCash: refs.funderCash,
          }),
        )
      : null;

  const residualPreview =
    invoice.status === "repaid" &&
    !paidTypes.has("residual") &&
    snapshot &&
    overdue &&
    refs.clientCollections &&
    refs.supplierPayable &&
    refs.platformOperating
      ? toDialog(
          residualEntries(snapshot, overdue, {
            clientCollections: refs.clientCollections,
            supplierPayable: refs.supplierPayable,
            platformOperating: refs.platformOperating,
          }),
        )
      : null;

  // The invoice as a document — what ops validates against. Tenor and age are
  // computed here so the decision does not require mental arithmetic.
  const daysBetween = (from: string, to: string) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  const todayIso = new Date().toISOString().slice(0, 10);
  const invoiceDocument = [
    { label: "Supplier", value: supplierName },
    { label: "Debtor", value: debtorName },
    { label: "Invoice number", value: invoice.invoiceNumber ?? "—" },
    { label: "Face value", value: `${formatMinor(invoice.faceValueMinor)} ${invoice.currency}` },
    { label: "Issue date", value: invoice.issueDate ?? "—" },
    { label: "Due date", value: invoice.dueDate },
    {
      label: "Payment terms",
      value: invoice.issueDate
        ? `${daysBetween(invoice.issueDate, invoice.dueDate)} days from issue`
        : "—",
    },
    {
      label: "Invoice age",
      value: invoice.issueDate
        ? `${daysBetween(invoice.issueDate, todayIso)} days`
        : "—",
    },
    { label: "Description", value: invoice.description ?? "—", wide: true },
  ];

  // Overdue-in-progress: past due and not yet repaid.
  const daysPastDue = repaymentEvent ? 0 : daysLateBetween(invoice.dueDate, new Date());

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
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
          {invoice.invoiceNumber ? (
            <span>
              Invoice <span className="font-mono text-ink">{invoice.invoiceNumber}</span>
            </span>
          ) : null}
          {invoice.issueDate ? <span>issued {invoice.issueDate}</span> : null}
          <span>due {invoice.dueDate}</span>
          <span className="font-mono text-[11.5px]">
            {/* The registry names the rail. A hard-coded pair here told a
                circle-fiat deal it was demo-internal — found live 2026-09-18. */}
            rail: {railFor(invoice.rail).label}
          </span>
          {invoice.description ? (
            <span className="basis-full text-muted">{invoice.description}</span>
          ) : null}
        </div>

        {daysPastDue > 0 && invoice.status === "disbursed" ? (
          <p className="mt-3 rounded-lg border border-flight/40 bg-flight/5 px-3 py-2 text-[13px] text-flight">
            {daysPastDue} {daysPastDue === 1 ? "day" : "days"} past due — overdue interest is
            accruing at the supplier&apos;s rate + 2%, charged against their residual (the debtor
            still owes exactly the face value).
          </p>
        ) : null}

        {overdue && overdue.supplierChargeMinor > 0n ? (
          <div className="mt-3 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[13px]">
            <span className="font-semibold">
              Repaid {overdue.daysLate} {overdue.daysLate === 1 ? "day" : "days"} late.
            </span>{" "}
            Overdue interest: supplier charged <Amount minor={overdue.supplierChargeMinor} /> ·
            funder receives <Amount minor={overdue.funderShareMinor} /> · platform keeps{" "}
            <Amount minor={overdue.platformShareMinor} />
            {overdue.capped ? " (capped at the residual — a supplier never owes more than they were due)" : ""}.
          </div>
        ) : null}

        {invoice.status === "refused" && invoice.refusalReason ? (
          <p className="mt-3 rounded-lg border border-refuse/30 bg-refuse/5 px-3 py-2 text-[13px] text-refuse">
            Refused: {invoice.refusalReason}
          </p>
        ) : null}
      </div>

      {/* 1 · TRADE VALIDATION — the decision made while looking at the
          invoice, with three outcomes (Chetan 2026-09-09). */}
      <Card
        title="1 · Trade validation"
        sub={
          invoice.status === "submitted"
            ? "Check the invoice, then approve, return it for corrections, or reject it."
            : invoice.status === "returned"
              ? "Returned to the supplier for correction — it re-enters validation when they resubmit."
              : invoice.status === "refused"
                ? "Rejected."
                : "Validated."
        }
      >
        {invoice.status === "submitted" ? (
          <TradeValidation invoiceId={invoice.id} document={invoiceDocument} />
        ) : (
          <div className="flex flex-col gap-2">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
              {invoiceDocument.map((d) => (
                <div
                  key={d.label}
                  className={`flex justify-between gap-4 border-b border-line/60 pb-1.5 ${d.wide ? "sm:col-span-2" : ""}`}
                >
                  <dt className="text-muted">{d.label}</dt>
                  <dd className="text-right font-medium">{d.value}</dd>
                </div>
              ))}
            </dl>
            {invoice.status === "returned" && invoice.correctionNote ? (
              <p className="mt-2 rounded-lg border border-flight/40 bg-flight/5 px-3 py-2 text-[13px] text-flight">
                Awaiting the supplier: {invoice.correctionNote}
              </p>
            ) : null}
          </div>
        )}
      </Card>

      {/* THE PRICING STEP — its own stage between the credit decision and
          funding (Chetan 2026-09-08). Cycle 7's limit check slots in here. */}
      {invoice.status !== "submitted" && invoice.status !== "refused" ? (
        <Card
          title="2 · Pricing"
          sub={
            snapshot
              ? "Locked at funding — every later leg reads these numbers."
              : invoice.status === "approved"
                ? "Approved. Set the rate card to price this deal; funding unlocks once it is priced."
                : "Priced. Re-price freely until funding locks the snapshot."
          }
        >
          {livePricing ? (
            <PricingResults
              breakdown={livePricing}
              faceValueMinor={invoice.faceValueMinor}
              locked={Boolean(snapshot)}
            />
          ) : (
            <p className="text-[13px] text-muted">
              No rate card yet — set one below and the full breakdown appears here.
            </p>
          )}

          {invoice.status === "approved" || invoice.status === "priced" ? (
            <div className="mt-5 border-t border-line pt-4">
              <PricingForm
                invoiceId={invoice.id}
                submitLabel={invoice.status === "priced" ? "Re-price" : "Price this deal"}
                initial={
                  terms
                    ? {
                        advanceRate: (terms.advanceRateBps / 100).toFixed(2),
                        supplierRate: (terms.supplierRateBps / 100).toFixed(2),
                        funderRate: (terms.funderRateBps / 100).toFixed(2),
                        txnCostType: terms.txnCostType,
                        // /100 covers both: fixed is minor units (15000 →
                        // 150.00), percent is bps (50 → 0.50).
                        txnCostValue: (Number(terms.txnCostValue) / 100).toFixed(2),
                        rail: invoice.rail,
                      }
                    : {}
                }
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5">
        <Card
          title="3 · Settlement"
          sub="Each consequence sits behind its own confirm — decisions, never results."
        >
          {invoice.status === "submitted" || invoice.status === "returned" ? (
            <p className="text-[13px] text-muted">
              Settlement opens once the deal is validated and priced.
            </p>
          ) : (
            <div className="flex flex-col gap-3.5 text-[13.5px]">
              {legs
                .filter((l) => l.status === "initiating" || l.status === "initiated" || l.status === "failed")
                .map((l) => (
                  <InFlightStrip
                    key={l.id}
                    legLabel={l.type[0].toUpperCase() + l.type.slice(1)}
                    amountMinor={l.amountMinor}
                    reference={l.railReference}
                    initiatedAt={l.initiatedAt}
                    pendingId={l.id}
                    failed={l.status === "failed"}
                    failureReason={l.failureReason}
                  />
                ))}
              <div className="flex items-center justify-between gap-3">
                <span className={invoice.status !== "approved" ? "text-muted/70" : undefined}>
                  Fund — books the financing leg
                </span>
                {invoice.status === "priced" && fundingPreview ? (
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
                        : invoice.status === "approved"
                          ? "Price this deal first — funding needs a rate card."
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

              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className={invoice.status !== "repaid" ? "text-muted/70" : undefined}>
                  Pay out funder — principal + return{overdue && overdue.funderShareMinor > 0n ? " + overdue" : ""}
                </span>
                {payoutPreview ? (
                  <ConfirmDialog
                    trigger="Pay out…"
                    title="Confirm payout to the funder"
                    description="The funder receives their principal and the return they were owed, plus their share of any overdue interest."
                    entries={payoutPreview}
                    invoiceId={invoice.id}
                    action={payoutFunder}
                    confirmLabel="Confirm — book payout"
                  />
                ) : (
                  <Button disabled title={paidTypes.has("payout") ? "Already paid out." : "The funder is paid out after the debtor repays."}>
                    Pay out…
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className={invoice.status !== "repaid" ? "text-muted/70" : undefined}>
                  Pay residual — what remains{overdue && overdue.supplierChargeMinor > 0n ? ", less the overdue charge" : ""}
                </span>
                {residualPreview ? (
                  <ConfirmDialog
                    trigger="Pay residual…"
                    title="Confirm the supplier's residual"
                    description="What remains of the face value after the funder's principal — less the supplier's overdue charge, of which the platform keeps the spread."
                    entries={residualPreview}
                    invoiceId={invoice.id}
                    action={payResidual}
                    confirmLabel="Confirm — book residual"
                  />
                ) : (
                  <Button disabled title={paidTypes.has("residual") ? "Already paid." : "The residual is paid after the debtor repays."}>
                    Pay residual…
                  </Button>
                )}
              </div>

              <p className="mt-1 text-[12px] text-muted">
                Every figure in a confirmation is recomputed on the server at the moment of the
                consequence — the browser posts the decision, never the amounts.
                {railFor(invoice.rail).settlement === "deferred"
                  ? ` On this deal each gate INITIATES a movement on ${railFor(invoice.rail).label} and books only once the rail confirms — the deal does not advance in the meantime.`
                  : invoice.rail === "usdc"
                    ? " On this deal each gate also moves real testnet USDC and books only once the transfer is verified on-chain."
                    : null}
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
                    {m.evidenceKind === "tx-hash" ? (
                      <ProvenanceBadge
                        href={`https://sepolia.basescan.org/tx/${m.evidenceRef}`}
                      >
                        {m.evidenceRef.slice(0, 10)}…{m.evidenceRef.slice(-6)}
                      </ProvenanceBadge>
                    ) : (
                      <ProvenanceBadge>
                        {m.evidenceKind} · {m.evidenceRef.split(":").pop()}
                      </ProvenanceBadge>
                    )}
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

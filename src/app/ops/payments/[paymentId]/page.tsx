// ONE PAYMENT, AND WHAT IT COULD BE FOR.
//
// The screen's job is to inform a decision, never to make one. Candidates are
// listed in maturity order — the escalation ladder's last rung, a stated
// policy — and NOTHING is ranked, scored or pre-selected. Two deposits of the
// same amount from the same sender are genuinely indistinguishable, and a
// product that picks one has invented information it does not have. That is
// exactly how a real repayment was lost at cycle 2.
//
// Legs that cannot take this money are shown WITH THEIR REASON rather than
// hidden. A list that silently omits them tells ops the leg does not exist.
//
// Host patterns, each cited:
//   · server component + force-dynamic + seatGate FIRST   src/app/ops/page.tsx
//   · two-column dl for a document under review          DESIGN_SYSTEM_NOTES.md
//   · Card wrapping a Table                              src/app/ops/page.tsx
//   · refusals as sentences in text-refuse, inline       DESIGN_SYSTEM_NOTES.md

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { ArrivedAge, PaymentStatePill, type PaymentTone } from "@/components/payment-state-pill";
import { seatGate } from "@/lib/roles/gate";
import { findPayment } from "@/lib/reconciliation/queue";
import { loadCandidates } from "@/lib/reconciliation/candidates";
import { railFor } from "@/lib/rails";
import { PaymentAttributeForm } from "@/components/payment-attribute-form";

export const dynamic = "force-dynamic";

export default async function PaymentDetail({
  params,
}: PageProps<"/ops/payments/[paymentId]">) {
  if (!process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION) notFound();

  const { paymentId } = await params;
  const gate = await seatGate("ops", `/ops/payments/${paymentId}`);
  if (gate) return gate;

  // The rail is DISCOVERED from the reference, never taken from the URL: the
  // browser posts decisions, not lookups, and letting it name the rail would
  // let it choose which one the server consults.
  const found = await findPayment(paymentId);
  if (!found) notFound();
  const { rail: RAIL, queued } = found;

  const { payment, attributedMinor, unattributedMinor, state, bookedAgainst } = queued;
  const tone: PaymentTone = payment.status === "complete" ? state : payment.status;

  // The movements already booked against this payment, as the model needs
  // them. One entry per booked leg; the amounts come from the ledger.
  const bookedAgainstPayment =
    attributedMinor > 0n ? [{ amountMinor: attributedMinor }] : [];

  const candidates =
    unattributedMinor > 0n && payment.status === "complete"
      ? await loadCandidates(RAIL, payment, bookedAgainstPayment)
      : [];

  const open = candidates.filter((c) => !c.refusal);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-[12.5px] text-muted">
        <Link className="hover:text-cobalt" href="/ops/payments">
          ← Money received
        </Link>
      </div>

      <Card title="The payment" sub={railFor(RAIL).label}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          <dt className="text-muted">Reference</dt>
          <dd>
            <ProvenanceBadge trusted>{payment.reference}</ProvenanceBadge>
          </dd>
          <dt className="text-muted">Amount</dt>
          <dd>
            <Amount minor={payment.amountMinor} /> {payment.currency}
          </dd>
          <dt className="text-muted">Sender</dt>
          <dd>
            {payment.sender?.name ?? <span className="text-muted">not stated by the rail</span>}
            {payment.sender?.id ? (
              <div className="font-mono text-[11px] text-muted">{payment.sender.id}</div>
            ) : null}
          </dd>
          <dt className="text-muted">Arrived</dt>
          <dd className="font-mono text-[12.5px]">
            {payment.arrivedAt.toISOString().replace("T", " ").slice(0, 19)}{" "}
            <span className="text-muted">
              (<ArrivedAge at={payment.arrivedAt} /> ago)
            </span>
          </dd>
          <dt className="text-muted">State</dt>
          <dd>
            <PaymentStatePill tone={tone} />
          </dd>
          <dt className="text-muted">Unattributed</dt>
          <dd>
            {unattributedMinor > 0n ? (
              <Amount minor={unattributedMinor} />
            ) : (
              <span className="text-muted">nothing left — fully attributed</span>
            )}
          </dd>
        </dl>

        {bookedAgainst.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3 text-[12.5px] text-muted">
            Already settled{" "}
            {bookedAgainst.map((b, i) => (
              <span key={`${b.invoiceId}-${b.legType}`}>
                {i > 0 ? ", " : ""}
                <Link className="hover:text-cobalt" href={`/ops/deals/${b.invoiceId}`}>
                  {b.legType} on {b.invoiceId.slice(0, 8)}
                </Link>
              </span>
            ))}
            .
          </div>
        ) : null}
      </Card>

      {payment.status !== "complete" ? (
        <Card title="Not yet attributable">
          <p className="text-[13px] text-refuse">
            {payment.status === "pending"
              ? "The rail has not confirmed this payment yet. It will become attributable when it does — nothing needs doing in the meantime."
              : "The rail's record says this payment failed. There is no money to attribute."}
          </p>
        </Card>
      ) : unattributedMinor <= 0n ? (
        <Card title="Fully attributed">
          <p className="text-[13px] text-muted">
            Every penny of this payment is accounted for in the ledger. One payment settles one
            thing, once.
          </p>
        </Card>
      ) : (
        <Card
          title="What could this be for?"
          sub={`${open.length} open leg${open.length === 1 ? "" : "s"} on this rail. Listed by earliest maturity — a reading order, NOT a recommendation. Nothing is ranked and nothing is pre-selected.`}
        >
          {candidates.length === 0 ? (
            <p className="text-[13px] text-muted">
              No leg on this rail is waiting for money. This payment matches nothing — leave it
              here until it can be matched rather than forcing it onto a deal. It will keep its
              place in the queue and its age.
            </p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Deal</Th>
                  <Th>Leg</Th>
                  <Th>Due</Th>
                  <Th right>Outstanding</Th>
                  <Th right>Would move</Th>
                  <Th>Attribute</Th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.leg.id}>
                    <Td>
                      <Link
                        className="font-medium hover:text-cobalt"
                        href={`/ops/deals/${c.invoice.id}`}
                      >
                        {c.invoice.supplier} → {c.invoice.debtor}
                      </Link>
                      <div className="font-mono text-[11px] text-muted">
                        {c.invoice.id.slice(0, 8)} · {c.invoice.status}
                      </div>
                    </Td>
                    <Td className="text-[12.5px]">{c.leg.type}</Td>
                    <Td className="font-mono text-[12.5px] text-muted">{c.invoice.dueDate}</Td>
                    <Td right>
                      <Amount minor={c.outstandingMinor} />
                    </Td>
                    <Td right>
                      {c.refusal ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <Amount minor={c.wouldMoveMinor} />
                      )}
                    </Td>
                    <Td>
                      {c.refusal ? (
                        <span className="text-[12.5px] text-refuse">{c.refusal.message}</span>
                      ) : c.displayEntries.length === 0 ? (
                        // The split would invent a penny. The action refuses
                        // this, so the gate must not offer it.
                        <span className="text-[12.5px] text-refuse">
                          This amount cannot be split across the leg&rsquo;s entries without
                          inventing a penny.
                        </span>
                      ) : (
                        <PaymentAttributeForm
                          reference={payment.reference}
                          legId={c.leg.id}
                          legType={c.leg.type}
                          dealLabel={`${c.invoice.supplier} → ${c.invoice.debtor}`}
                          amountMinor={c.wouldMoveMinor.toString()}
                          entries={c.displayEntries}
                          // More than one leg fits → a reason is REQUIRED.
                          // "Ops picked one" is the audit answer this cycle
                          // exists to prevent.
                          reasonRequired={open.length > 1}
                        />
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}

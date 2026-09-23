// THE RECONCILIATION QUEUE — the screen this cycle exists for.
//
// Until now the product could only ever see the exception it happened to trip
// over: inbound matching ran per-leg, kept the one deposit that matched, and
// discarded the rest in memory. A live reconciliation on 2026-09-21 found 3 of
// 13 deposits unattributed, worth $50,105 — where the release record stated,
// as the basis of a go/no-go decision, that the figure was one deposit and
// $100. This page is what makes that question answerable at all.
//
// Host patterns copied, each cited:
//   · server component + force-dynamic + seatGate FIRST   src/app/ops/page.tsx
//   · Card wrapping a Table                               src/app/ops/page.tsx
//   · Amount for every figure                             src/components/ui/amount.tsx
//   · derived-balance stat card with its stamp            src/app/ops/ledger
//   · refusals as sentences, never toasts                 DESIGN_SYSTEM_NOTES.md

import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { ArrivedAge, PaymentStatePill, type PaymentTone } from "@/components/payment-state-pill";
import { seatGate } from "@/lib/roles/gate";
import { loadQueue } from "@/lib/reconciliation/queue";
import { railFor } from "@/lib/rails";

export const dynamic = "force-dynamic";

/** The rail this queue reads. Fiat is the only one with an outside today;
 *  the others answer `unsupported` and the page says so rather than showing
 *  an empty table. */
const RAIL = "circle-fiat" as const;

export default async function PaymentsQueue() {
  // A public flag is never a permission, and it is not a route either: with
  // the flag absent this page does not exist. Checked here on the server, the
  // pattern the webhook route established (api/webhooks/circle/route.ts:40).
  if (!process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION) notFound();

  const gate = await seatGate("ops", "/ops/payments");
  if (gate) return gate;

  const result = await loadQueue(RAIL);

  if (!result.supported) {
    // NOT an empty table. "We could not ask" and "nothing arrived" are
    // different statements and only one of them is true.
    return (
      <Card title="Money received" sub={railFor(RAIL).label}>
        <p className="text-[13px] text-muted">{result.reason}</p>
      </Card>
    );
  }

  const { payments, totals } = result;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="font-mono text-[19px] tabular-nums">{totals.count}</div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted">
            payments received
          </div>
          <div className="text-[12px] text-muted">
            everything the rail holds, expected or not
          </div>
        </Card>
        <Card>
          <div className="font-mono text-[19px] tabular-nums text-flight">
            {totals.unattributedCount}
          </div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted">unattributed</div>
          <div className="text-[12px] text-muted">
            money the ledger cannot yet account for
          </div>
        </Card>
        <Card>
          <div className="font-mono text-[19px] tabular-nums text-flight">
            <Amount minor={totals.unattributedMinor} />
          </div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted">
            unattributed value
          </div>
          <div className="text-[12px] text-muted">
            = SUM(payments) − SUM(movements) · derived, never stored
          </div>
        </Card>
      </div>

      <Card
        title="Money received"
        sub={`${railFor(RAIL).label} — read from the rail itself, not from the notification log. Attribution is derived by summing what has booked against each payment.`}
      >
        {payments.length === 0 ? (
          <p className="text-[13px] text-muted">
            The rail holds no payments for this account yet.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Payment</Th>
                <Th>Sender</Th>
                <Th right>Amount</Th>
                <Th right>Unattributed</Th>
                <Th>Arrived</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map(({ payment, unattributedMinor, state, bookedAgainst }) => {
                const tone: PaymentTone =
                  payment.status === "complete" ? state : payment.status;
                return (
                  <tr key={payment.reference}>
                    <Td>
                      <Link
                        className="font-medium hover:text-cobalt"
                        href={`/ops/payments/${payment.reference}`}
                      >
                        {/* The cycle-2 third treatment: solid because a
                            Circle payment id IS real evidence, unlinked
                            because it lives in someone else's database and
                            there is nowhere to send a reader. */}
                        <ProvenanceBadge trusted>
                          {payment.reference.slice(0, 8)}
                        </ProvenanceBadge>
                      </Link>
                      {bookedAgainst.length > 0 ? (
                        <div className="mt-1 text-[12px] text-muted">
                          settled {bookedAgainst.map((b) => b.legType).join(", ")} on{" "}
                          {bookedAgainst.map((b) => b.invoiceId.slice(0, 8)).join(", ")}
                        </div>
                      ) : null}
                    </Td>
                    <Td className="text-[12.5px] text-muted">
                      {payment.sender?.name ?? (
                        // A payment with no sender is still fully attributable:
                        // the sender is context for a person, never a
                        // precondition.
                        <span className="text-track-idle">not stated</span>
                      )}
                    </Td>
                    <Td right>
                      <Amount minor={payment.amountMinor} />
                    </Td>
                    <Td right>
                      {unattributedMinor > 0n ? (
                        <Amount minor={unattributedMinor} />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td>
                      <ArrivedAge at={payment.arrivedAt} />
                    </Td>
                    <Td>
                      <PaymentStatePill tone={tone} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

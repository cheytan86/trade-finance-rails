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
import { loadAllQueues } from "@/lib/reconciliation/queue";
import { railFor } from "@/lib/rails";

export const dynamic = "force-dynamic";

export default async function PaymentsQueue() {
  // A public flag is never a permission, and it is not a route either: with
  // the flag absent this page does not exist. Checked here on the server, the
  // pattern the webhook route established (api/webhooks/circle/route.ts:40).
  if (!process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION) notFound();

  const gate = await seatGate("ops", "/ops/payments");
  if (gate) return gate;

  // EVERY RAIL, not one. Rails with no outside still appear, each carrying
  // its reason — so a person whose deal settled on demo-internal is told why
  // it is absent instead of concluding the screen is broken.
  const results = await loadAllQueues();
  const unreachable = results.filter((r) => r.status === "unreachable");
  const totals = results.reduce(
    (t, r) => {
      if (r.status !== "ok") return t;
      return {
        count: t.count + r.totals.count,
        unattributedCount: t.unattributedCount + r.totals.unattributedCount,
        unattributedMinor: t.unattributedMinor + r.totals.unattributedMinor,
      };
    },
    { count: 0, unattributedCount: 0, unattributedMinor: 0n },
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <div className="font-mono text-[19px] tabular-nums">{totals.count}</div>
          <div className="text-[11.5px] uppercase tracking-wide text-muted">
            payments received
          </div>
          <div className="text-[12px] text-muted">
            everything the rails hold, expected or not
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

      {unreachable.length > 0 ? (
        // Stated ABOVE the figures, because it makes them incomplete.
        <Card title="These totals are incomplete">
          <p className="text-[13px] text-refuse">
            {unreachable.length === 1 ? "A rail" : `${unreachable.length} rails`} could not be
            reached, so money may have arrived that is not counted here.
          </p>
        </Card>
      ) : null}

      {results.map((result) =>
        result.status === "unreachable" ? (
          <Card key={result.rail} title={railFor(result.rail).label}>
            <p className="text-[13px] text-refuse">{result.reason}</p>
          </Card>
        ) : result.status === "unsupported" ? (
          // NOT an empty table. "This rail has no outside" and "nothing
          // arrived" are different statements, and only one of them is true.
          <Card key={result.rail} title={railFor(result.rail).label}>
            <p className="text-[13px] text-muted">{result.reason}</p>
          </Card>
        ) : (
          <Card
            key={result.rail}
            title={railFor(result.rail).label}
            sub="Read from the rail itself, not from the notification log. Attribution is derived by summing what has booked against each payment."
          >
            {result.payments.length === 0 ? (
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
                  {result.payments.map(
                    ({ payment, unattributedMinor, state, bookedAgainst }) => {
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
                                  because it lives in someone else's database
                                  and there is nowhere to send a reader. */}
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
                              // `text-muted` — NOT the dashboard's track-idle,
                              // which this app does not define and which
                              // therefore rendered as no colour at all.
                              <span className="text-muted">not stated by the rail</span>
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
                    },
                  )}
                </tbody>
              </Table>
            )}
          </Card>
        ),
      )}
    </div>
  );
}

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { StatusPill } from "@/components/ui/status-pill";
import { Amount } from "@/components/ui/amount";
import { funderPositions, resolvePartyForSeat, openLegs } from "@/lib/queries";
import { parseSnapshot } from "@/lib/pricing";
import { seatGate } from "@/lib/roles/gate";
import { formatMinor } from "@/lib/money";
import { getIdentity } from "@/lib/roles/identity";

export const dynamic = "force-dynamic";

export default async function FunderPage() {
  const gate = await seatGate("funder");
  if (gate) return gate;
  const identity = await getIdentity();
  const funder = await resolvePartyForSeat("funder", identity?.partyId);
  if (!funder) {
    return <p className="text-[13px] text-muted">No funder exists — run the seed script.</p>;
  }
  const { deals, cashBalance } = await funderPositions(funder.id);
  const inFlight = await openLegs();
  const inFlightFor = (invoiceId: string) =>
    inFlight.filter((l) => l.leg.invoiceId === invoiceId);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        Acting as <span className="font-semibold text-ink">{funder.name}</span> — the demo funder
        seat. Positions, not the supplier&apos;s book: each seat sees only its own surface.
      </p>

      <Card className="max-w-xs p-4">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
          funder_cash
        </div>
        <div className="mt-1.5">
          <Amount minor={cashBalance} className="text-[19px]" />
        </div>
        <div className="mt-0.5 text-[11px] text-muted">= SUM(entries) · derived, never stored</div>
      </Card>

      <Card title="Positions" sub="Deals this funder's capital is in — principal from the locked snapshot.">
        {deals.length === 0 ? (
          <p className="text-[13px] text-muted">No positions — nothing has been funded yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Deal</Th>
                <Th right>Principal</Th>
                <Th>Due</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {deals.map(({ invoice, supplierName, debtorName }) => {
                const snap = invoice.pricingSnapshot
                  ? parseSnapshot(invoice.pricingSnapshot)
                  : null;
                return (
                  <tr key={invoice.id}>
                    <Td>
                      <Link className="hover:text-cobalt" href={`/ops/deals/${invoice.id}`}>
                        {supplierName} → {debtorName}
                      </Link>
                    </Td>
                    <Td right>{snap ? <Amount minor={snap.principalMinor} /> : "—"}</Td>
                    <Td className="font-mono text-[12.5px] text-muted">{invoice.dueDate}</Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={invoice.status} />
                        {inFlightFor(invoice.id).map((l) => (
                          <span
                            key={l.leg.id}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-flight px-2.5 py-0.5 text-xs font-semibold text-flight"
                          >
                            <i className="h-[5px] w-[5px] rounded-full border-[1.5px] border-flight" />
                            {l.leg.type} in flight · {formatMinor(l.leg.amountMinor)} expected
                          </span>
                        ))}
                      </div>
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

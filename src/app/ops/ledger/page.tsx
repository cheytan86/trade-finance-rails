import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { chartByOwnership, allMovements, openLegs } from "@/lib/queries";
import { seatGate } from "@/lib/roles/gate";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const gate = await seatGate("ops");
  if (gate) return gate;
  const { clientMoney, platformOwn } = await chartByOwnership();
  const movements = await allMovements();
  const inFlight = await openLegs();

  return (
    <div className="flex flex-col gap-5">
      {inFlight.length > 0 ? (
        <div className="rounded-card border-[1.5px] border-dashed border-flight bg-flight/[0.03] p-5">
          <div className="text-[15px] font-semibold text-flight">In flight</div>
          <div className="mt-0.5 text-[13px] text-muted">Initiated, not settled</div>
          <Table>
            <thead>
              <tr>
                <Th>Leg</Th>
                <Th>Deal</Th>
                <Th>Reference</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {inFlight.map((r) => (
                <tr key={r.leg.id}>
                  <Td>{r.leg.type}</Td>
                  <Td>{r.invoiceNumber ?? r.leg.invoiceId.slice(0, 8)}</Td>
                  <Td>
                    {r.leg.railReference ? (
                      <ProvenanceBadge trusted>{r.leg.railReference}</ProvenanceBadge>
                    ) : (
                      <ProvenanceBadge>awaiting a reference</ProvenanceBadge>
                    )}
                  </Td>
                  <Td right>
                    <Amount minor={r.leg.amountMinor} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-3 font-mono text-[11px] text-muted">
            Excluded from every balance below. In-flight money is not money — these legs have no
            ledger entries, so no balance can accidentally include them.
          </div>
        </div>
      ) : null}

      <BalanceGroup
        heading="Client money held"
        sub="Money held for others — never the platform's"
        accounts={clientMoney}
      />
      <BalanceGroup
        heading="Platform funds"
        sub="The platform's own, and only the platform's"
        accounts={platformOwn}
      />

      <Card title="Movements" sub="Every movement's entries sum to zero; every event carries its evidence.">
        {movements.length === 0 ? (
          <p className="text-[13px] text-muted">The ledger is empty — run the seed, or fund a deal.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>Deal</Th>
                <Th>Entries</Th>
                <Th right>Amounts</Th>
                <Th>Evidence</Th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.eventId}>
                  <Td className="font-semibold">{m.type}</Td>
                  <Td>
                    <Link
                      className="font-mono text-[12px] text-muted hover:text-cobalt"
                      href={`/ops/deals/${m.invoiceId}`}
                    >
                      {m.invoiceId.slice(0, 8)}
                    </Link>
                  </Td>
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
                    <ProvenanceBadge>{m.evidenceKind}</ProvenanceBadge>
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

/**
 * Two subtotals, not one grid. Cycle 2's segregation split is only worth doing
 * if it is visible: an operator should be able to see at a glance what is held
 * for others and what the platform has actually earned.
 */
function BalanceGroup({
  heading,
  sub,
  accounts,
}: {
  heading: string;
  sub: string;
  accounts: Array<{ id: string; label: string; balanceMinor: bigint }>;
}) {
  if (accounts.length === 0) return null;
  const total = accounts.reduce((s, a) => s + a.balanceMinor, 0n);
  return (
    <div>
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
          {heading}
        </span>
        <span className="text-[12px] text-muted">{sub}</span>
        <span className="flex-1" />
        <Amount minor={total} className="text-[15px]" />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {accounts.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              {a.label}
            </div>
            <div className="mt-1.5">
              <Amount minor={a.balanceMinor} className="text-[19px]" />
            </div>
            <div className="mt-0.5 text-[11px] text-muted">
              = SUM(entries) · derived, never stored
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

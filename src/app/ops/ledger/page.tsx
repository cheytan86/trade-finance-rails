import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, Th, Td } from "@/components/ui/table";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { Amount } from "@/components/ui/amount";
import { chartWithBalances, allMovements } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const chart = await chartWithBalances();
  const movements = await allMovements();

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {chart.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
              {a.label}
            </div>
            <div className="mt-1.5">
              <Amount minor={a.balanceMinor} className="text-[19px]" />
            </div>
            <div className="mt-0.5 text-[11px] text-muted">= SUM(entries) · derived, never stored</div>
          </Card>
        ))}
      </div>

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

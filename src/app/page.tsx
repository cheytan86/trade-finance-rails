import Link from "next/link";
import { Card } from "@/components/ui/card";

const SEATS = [
  {
    href: "/supplier",
    name: "Supplier",
    line: "Submit an invoice, watch it move, see the disbursement land.",
  },
  { href: "/ops", name: "Platform ops", line: "Review, approve, fund and disburse — every gate is yours." },
  { href: "/funder", name: "Funder", line: "Positions and cash, derived from the ledger." },
  { href: "/pay", name: "Debtor", line: "The public payment link — no account, as in reality." },
] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">One deal, four pairs of hands.</h1>
      <p className="mt-2 max-w-lg text-[14px] text-muted">
        A receivables deal carried from submission to disbursement, every movement booked as
        balanced ledger entries. Pick a seat — the switch above moves you between them.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SEATS.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <Card className="h-full transition-colors group-hover:border-cobalt/40">
              <div className="font-semibold group-hover:text-cobalt">{s.name}</div>
              <div className="mt-1 text-[13px] text-muted">{s.line}</div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

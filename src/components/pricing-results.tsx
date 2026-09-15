import { Table, Td } from "@/components/ui/table";
import { Amount } from "@/components/ui/amount";
import { computeIndicators, formatBps } from "@/lib/pricing/indicators";
import type { PricingBreakdown } from "@/lib/pricing";

/**
 * What the rate card actually produces. Two states, and the difference is the
 * point: before funding these numbers are INDICATIVE and move every day as the
 * tenor shrinks; at funding they LOCK into the snapshot every later leg reads.
 */
export function PricingResults({
  breakdown,
  faceValueMinor,
  locked,
}: {
  breakdown: PricingBreakdown;
  faceValueMinor: bigint;
  locked: boolean;
}) {
  const ind = computeIndicators(breakdown, faceValueMinor);

  const rows: Array<[string, React.ReactNode, string?]> = [
    ["Face value", <Amount key="f" minor={faceValueMinor} />],
    ["Principal advanced", <Amount key="p" minor={breakdown.principalMinor} />, "face × advance rate"],
    ["− Supplier interest", <Amount key="si" minor={breakdown.supplierInterestMinor} />, `act/360 over ${breakdown.tenorDays} days`],
    ["− Transaction cost", <Amount key="tc" minor={breakdown.txnCostMinor} />],
    ["= Supplier receives now", <Amount key="sd" minor={breakdown.supplierDisbursementMinor} />, "the disbursement leg"],
    ["Funder pays in", <Amount key="ff" minor={breakdown.funderFinancingMinor} />, "principal less their return"],
    ["Funder return", <Amount key="fi" minor={breakdown.funderInterestMinor} />, "paid at payout"],
    ["Platform margin", <Amount key="m" minor={breakdown.platformMarginMinor} />, "banked at funding"],
    ["Supplier residual", <Amount key="r" minor={breakdown.supplierResidualMinor} />, "paid after the debtor settles"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          locked
            ? "rounded-lg border border-good/30 bg-good/5 px-3 py-2 text-[12.5px] text-good"
            : "rounded-lg border border-flight/40 bg-flight/5 px-3 py-2 text-[12.5px] text-flight"
        }
      >
        {locked
          ? `Locked at funding — tenor ${breakdown.tenorDays} days. Every later leg reads these numbers, so a shrinking tenor cannot move a funded deal.`
          : `Indicative, as of today — tenor ${breakdown.tenorDays} days and shrinking. These figures move daily until funding locks them.`}
      </div>

      <Table>
        <tbody>
          {rows.map(([label, value, note]) => (
            <tr key={label}>
              <Td>
                {label}
                {note ? <span className="ml-2 text-[11.5px] text-muted">{note}</span> : null}
              </Td>
              <Td right>{value}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Indicator
          label="Supplier all-in cost"
          primary={formatBps(ind.supplierAllInBps)}
          secondary={
            ind.annualisable ? `${formatBps(ind.supplierAllInAnnualisedBps)} p.a.` : "—"
          }
          note="fees ÷ funds received"
        />
        <Indicator
          label="Funder yield"
          primary={ind.annualisable ? `${formatBps(ind.funderYieldAnnualisedBps)} p.a.` : "—"}
          secondary={`${breakdown.tenorDays}-day tenor`}
          note="return ÷ cash in"
        />
        <Indicator
          label="Platform margin"
          primary={<Amount minor={ind.platformMarginMinor} className="text-[19px]" />}
          secondary={`${ind.platformMarginBpsOfFace} bps of face`}
          note="the spread, banked at funding"
        />
      </div>

      <p className="text-[11.5px] text-muted">
        Annualised figures use calendar days (×365 ÷ tenor) and are rounded once from the exact
        ratio. Illustrative rates — nothing here is a quoted price.
      </p>
    </div>
  );
}

function Indicator({
  label,
  primary,
  secondary,
  note,
}: {
  label: string;
  primary: React.ReactNode;
  secondary: string;
  note: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-[19px] tabular-nums">{primary}</div>
      <div className="mt-0.5 font-mono text-[12px] text-muted">{secondary}</div>
      <div className="mt-1 text-[11px] text-muted">{note}</div>
    </div>
  );
}

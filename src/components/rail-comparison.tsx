// THE COMPARISON — cycle 4, and the screen the product's headline claim
// depends on.
//
// `YOUR_PRODUCT.md` frames this product as one "in which the settlement rail
// for each money leg is an explicit, priced decision rather than a technical
// default". Explicit has been true since cycle 1: ops picks the rail and it is
// stored on the invoice. INFORMED has not. Until this table, the entire
// decision aid was one paragraph of prose under a dropdown — "usually
// minutes", which is roughly right about the typical case and silent about the
// number an operator needs when a debtor is waiting.
//
// EVERY FIGURE HERE IS COUNTED FROM pending_settlements. Nothing is asserted,
// nothing is configured, and nothing is cached: the table is what this
// platform has actually done.
//
// THE ORDER IS REGISTRY ORDER AND IS NEVER A RANKING. Nothing sorts by speed,
// nothing is highlighted, nothing carries a "recommended" chip. Cycle 3 fixed
// this principle in code — "ambiguity is a choice presented, never a guess
// made" — and a comparison that ranks has made the choice on ops's behalf.

import { Card } from "./ui/card";
import { Table, Th, Td } from "./ui/table";
import { ProvenanceBadge } from "./ui/provenance-badge";
import { loadRailHistory, type RailDuration, type RailHistory } from "@/lib/rails/history";
import { ALL_RAILS, type Verifiability } from "@/lib/rails";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.basescan.org";

/**
 * SUB-SECOND IS "UNDER A SECOND", NOT A NUMBER.
 *
 * This is the display half of FIX 1. Two reasons, and the second is the real
 * one: precision below a second across a network is not information, and
 * printing "78 ms" beside "54.9 s" invites a reader to compare them as though
 * they measure the same kind of event — when one rail moves nothing at all.
 */
function duration(ms: number): string {
  if (ms < 1_000) return "under a second";
  if (ms < 90_000) return `${(ms / 1_000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

/** The speed cell, including the case where there is nothing to say. */
function Speed({ d }: { d: RailDuration }) {
  if (!d.known) {
    // NOT a zero, NOT a dash, NOT "instant". A rail with no settlements has
    // not been fast and has not been slow — it has not been used. Cycle 3
    // fixed this exact class one layer down: an empty list must never read as
    // "nothing arrived".
    return <span className="text-muted">no settlements yet</span>;
  }
  return (
    <span className="font-mono text-[13px]">
      {duration(d.medianMs)}
      <span className="ml-2 text-[12px] text-muted">
        median of {d.count}
        {d.count > 1 ? ` · slowest ${duration(d.slowestMs)}` : ""}
      </span>
    </span>
  );
}

/**
 * WHO CAN CHECK A SETTLEMENT ON THIS RAIL, in the host's own provenance
 * vocabulary rather than a new one.
 *
 * `DESIGN_SYSTEM_NOTES.md` reserved these three treatments at cycle 2's close
 * and named this column as their tenant: dashed-muted is a stand-in for proof,
 * solid-cobalt IS the proof and opens, solid-unlinked is real evidence held by
 * someone who is not us. A reader who has used /ops/ledger already knows what
 * each one means, so the column teaches itself.
 *
 * ONE LIBERTY, NAMED: on `usdc` the badge links to the explorer itself rather
 * than to a transaction, because this cell describes a CLASS of evidence and
 * not an instance. The label says "on Basescan" so the link's promise matches
 * what it delivers.
 *
 * AND IT IS NOT A RANKING. "Public" is not better than "our word"; they
 * describe different things a reader may need to trust.
 */
function VerifiableBy({ v }: { v: Verifiability }) {
  if (v === "public") return <ProvenanceBadge href={EXPLORER}>anyone, on Basescan</ProvenanceBadge>;
  if (v === "custodian") return <ProvenanceBadge trusted>the rail&rsquo;s own record</ProvenanceBadge>;
  return <ProvenanceBadge>our word only</ProvenanceBadge>;
}

/**
 * WHAT CAN GO WRONG — declared and counted, in ONE cell, deliberately.
 *
 * Each half alone misleads. `demo-internal` shows zero problems because
 * NOTHING EVER LEAVES THE BUILDING, and a zero meaning "we never tried" looks
 * identical to one meaning "it always works" — only the sentence tells them
 * apart. Conversely the sentence alone is what the dropdown already had: prose
 * nobody can check. Putting them in one cell means they cannot be read apart.
 *
 * "DID NOT SETTLE CLEANLY", never "failures". The live data's single such row
 * reads "REPAIR 2026-09-18: matched deposit a0afd5d4 which had already
 * settled" — a human's note, not a rail failing. The name is true of it where
 * the other would not be, and the name is the whole repair.
 */
function WhatCanGoWrong({ h, modes }: { h: RailHistory; modes: string }) {
  const attempts = h.settled + h.didNotSettleCleanly + h.stillOpen;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[12.5px] text-muted">{modes}</span>
      <span className="font-mono text-[12px]">
        {attempts === 0 ? (
          <span className="text-muted">nothing attempted yet</span>
        ) : (
          <>
            {h.didNotSettleCleanly} of {attempts} did not settle cleanly
          </>
        )}
      </span>
    </div>
  );
}

/**
 * WHAT A PERSON SEES WHILE THE QUERY RUNS.
 *
 * Cycle 3 paid for this lesson at Deploy: the application had ZERO loading
 * states, a click on a money screen showed two seconds of nothing, and the
 * defect was invisible locally because the database was 40 ms away. This table
 * adds a query to the busiest screen in the product, so it gets a Suspense
 * boundary and the rest of stage 2 paints without waiting for it.
 *
 * Same shape and heading as the real thing, so nothing jumps when it arrives.
 * Nothing animates — a spinner would be a new idiom in a host that has none.
 */
export function RailComparisonSkeleton() {
  return (
    <Card
      title="What each rail has actually done"
      sub="Counting this platform's own settlements…"
    >
      <p className="text-[13px] text-muted">
        Nothing here is stored or cached — the figures are counted afresh every time this
        stage opens, so they are what the platform has done as of right now.
      </p>
    </Card>
  );
}

export async function RailComparison() {
  let history;
  try {
    history = await loadRailHistory();
  } catch {
    // A PRICING DECISION IS NEVER BLOCKED BY A DECISION AID. Cycle 3's D2
    // found the mirror of this: a rail with no timeout would have hung the ops
    // deal book until the serverless function itself gave up, showing nothing.
    //
    // WHAT THIS DOES NOT PROTECT AGAINST, stated rather than implied. If the
    // database is wholly unreachable the page is already gone — `invoiceDetail`,
    // `movementsForInvoice`, `accountRefsFor` and `legsForInvoice` all run
    // before this component renders. So this catch covers a failure SPECIFIC
    // to this query — a timeout as `pending_settlements` grows, a migration
    // mid-flight — and not an outage. It is worth having for exactly that, and
    // claiming more would be a comment that flatters the code.
    //
    // The sentence says we could not ASK — never "these rails have no
    // history", which is a different statement and a false one. Cycle 3 fixed
    // that exact class twice: an empty list must never read as "nothing
    // arrived".
    return (
      <Card title="What each rail has actually done">
        <p className="text-[13px] text-muted">
          We could not read this platform&rsquo;s settlement history just now, so this
          comparison is unavailable. The rail choice below is unaffected — nothing here
          feeds the pricing.
        </p>
      </Card>
    );
  }

  const excluded = history.reduce((n, h) => n + h.excludedImpossible, 0);

  return (
    <Card
      title="What each rail has actually done"
      sub="Counted from this platform's own settlements — not a claim, and not a recommendation."
    >
      <Table>
        <thead>
          <tr>
            <Th>Rail</Th>
            <Th>How long it took</Th>
            <Th>What can go wrong</Th>
            <Th>Verifiable by</Th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => {
            const rail = ALL_RAILS.find((r) => r.id === h.rail)!;
            return (
              <tr key={h.rail}>
                <Td>{rail.label}</Td>
                <Td>
                  <Speed d={h.duration} />
                </Td>
                <Td>
                  <WhatCanGoWrong h={h} modes={rail.failureModes} />
                </Td>
                <Td>
                  <VerifiableBy v={rail.verifiability} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {excluded > 0 ? (
        // Said out loud rather than dropped silently. These rows were written
        // before FIX 1, when `resolvedAt` came from the application's clock
        // and `initiatedAt` from the database's — so they record durations
        // below zero, which cannot be true. They are excluded from every
        // figure above, and a reader is entitled to know how many.
        <p className="mt-3 text-[12px] text-muted">
          {excluded} earlier {excluded === 1 ? "settlement is" : "settlements are"} excluded:
          recorded before this product measured both ends of a settlement with the same clock,
          so {excluded === 1 ? "its duration is" : "their durations are"} impossible rather than
          merely wrong.
        </p>
      ) : null}

      <p className="mt-3 text-[12px] text-muted">
        Listed in a fixed order. Nothing here is ranked and nothing is recommended — the
        choice below is yours.
      </p>
    </Card>
  );
}

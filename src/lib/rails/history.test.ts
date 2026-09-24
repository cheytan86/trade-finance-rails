// The aggregation, tested against every edge the live data actually produced.
//
// These are PURE tests — `summarise` takes rows and returns figures, so no
// database is needed and no test depends on a deal book that changes every
// time someone funds something.

import { describe, it, expect } from "vitest";
import { summarise, type HistoryRow } from "./history";
import { ALL_RAILS } from "@/lib/rails";
import {
  manySettlements,
  noHistory,
  oneSettlement,
  wideSpread,
  impossibleDuration,
  didNotSettleCleanly,
} from "@/features/rail-comparison/fixtures";

const of = (rows: HistoryRow[], rail: string) => summarise(rows).find((r) => r.rail === rail)!;

describe("summarise — the ordinary case", () => {
  it("counts settlements and takes the MIDDLE duration, not the mean", () => {
    const h = of(manySettlements, "circle-fiat");
    expect(h.settled).toBe(5);
    expect(h.duration).toEqual({
      known: true,
      count: 5,
      medianMs: 4_000,
      slowestMs: 612_000,
    });
    // The distinction that matters: the mean of these five is 135 s, which no
    // settlement resembles. The median is 4 s. One ten-minute outlier must not
    // be allowed to describe the typical case.
    const mean = (1_000 + 3_000 + 4_000 + 55_000 + 612_000) / 5;
    expect(mean).toBeGreaterThan(100_000);
    expect((h.duration as { medianMs: number }).medianMs).toBe(4_000);
  });

  it("reports the SLOWEST beside the median — the number an operator needs", () => {
    // "Half were faster than 4 s" does not tell you what to say to a debtor on
    // the phone. "The slowest we have seen is 10 minutes" does.
    const h = of(manySettlements, "circle-fiat");
    expect((h.duration as { slowestMs: number }).slowestMs).toBe(612_000);
  });
});

describe("summarise — a rail with no history", () => {
  it("says it does NOT KNOW, rather than reporting a zero", () => {
    // `usdc` is in this state in the live database right now. The cheapest
    // wrong answer is `medianMs: 0`, which renders as "instant" and is a lie
    // about a rail that has never been used. Cycle 3 fixed this exact class
    // one layer down: an empty list must never read as "nothing arrived".
    const h = of(noHistory, "usdc");
    expect(h.duration).toEqual({ known: false });
    expect(h.settled).toBe(0);
    expect(h).not.toHaveProperty("medianMs");
  });

  it("returns EVERY rail even when none has any history", () => {
    // A rail must never fall off the comparison for having no data — that is
    // how a rail silently disappears from a decision.
    expect(summarise(noHistory)).toHaveLength(3);
  });
});

describe("summarise — one settlement", () => {
  it("a median of one observation is that observation, and the count says so", () => {
    const h = of(oneSettlement, "usdc");
    expect(h.duration).toEqual({
      known: true,
      count: 1,
      medianMs: 31_000,
      slowestMs: 31_000,
    });
    // The count is what stops "31 s" reading as a rate. The screen renders it.
    expect((h.duration as { count: number }).count).toBe(1);
  });
});

describe("summarise — durations spanning three orders of magnitude", () => {
  it("holds from milliseconds to minutes in one column", () => {
    const h = of(wideSpread, "demo-internal");
    expect(h.settled).toBe(4);
    // sorted: 12, 78, 950, 61000 → median is the mean of the middle two
    expect(h.duration).toEqual({
      known: true,
      count: 4,
      medianMs: (78 + 950) / 2,
      slowestMs: 61_000,
    });
  });
});

describe("summarise — FIX 1's regression, in the reader", () => {
  it("EXCLUDES an impossible duration and reports how many it excluded", () => {
    // Two of these three rows are pre-FIX-1: the application's clock ran
    // behind the database's, so the leg appears to finish before it started.
    // A duration below zero is not a fast rail; it is a measurement that
    // cannot be true.
    const h = of(impossibleDuration, "demo-internal");
    expect(h.excludedImpossible).toBe(2);
    expect(h.settled).toBe(1);
    expect(h.duration).toEqual({ known: true, count: 1, medianMs: 78, slowestMs: 78 });
  });

  it("an excluded row is excluded from the COUNTS too, not just the duration", () => {
    // A row we cannot trust about time is not evidence about outcome either.
    // Counting it in one column and not the other would make the columns
    // disagree, and a reader would have no way to tell which was wrong.
    const h = of(impossibleDuration, "demo-internal");
    expect(h.settled + h.didNotSettleCleanly + h.stillOpen + h.excludedImpossible).toBe(3);
  });

  it("needs no cutover date to do it", () => {
    // Deliberately no constant to assert against. A hard-coded "FIX 1 landed
    // at T" would be wrong the moment the fix deploys somewhere at a
    // different hour; impossibility is self-describing.
    const mixed: HistoryRow[] = [
      ...impossibleDuration,
      { rail: "circle-fiat", status: "settled", initiatedAt: new Date(0), resolvedAt: new Date(55_000) },
    ];
    const fiat = of(mixed, "circle-fiat");
    // A pre-fix row on a SLOW rail keeps its place: 60 ms of skew against a
    // 55-second settlement is noise, and throwing it away would discard
    // usable history to avoid explaining a footnote.
    expect(fiat.excludedImpossible).toBe(0);
    expect(fiat.settled).toBe(1);
  });
});

describe("summarise — did not settle cleanly", () => {
  it("counts a failed leg WITHOUT calling it a rail failure", () => {
    // The live database's single failed row reads "REPAIR 2026-09-18: matched
    // deposit a0afd5d4 which had already settled" — a human's note about
    // fixing something. The count is true; the column's NAME is what keeps it
    // true, and that is the whole repair. No filter, no rule, no migration.
    const h = of(didNotSettleCleanly, "circle-fiat");
    expect(h.didNotSettleCleanly).toBe(1);
  });

  it("an in-flight leg is neither settled nor failed", () => {
    const h = of(didNotSettleCleanly, "circle-fiat");
    expect(h.stillOpen).toBe(1);
    expect(h.settled).toBe(1);
  });

  it("a failed leg's duration is NOT in the median", () => {
    // It took ten minutes to fail. Mixing that into "how long this rail takes
    // to settle" would answer a different question than the column asks.
    const h = of(didNotSettleCleanly, "circle-fiat");
    expect(h.duration).toEqual({ known: true, count: 1, medianMs: 40_000, slowestMs: 40_000 });
  });
});

describe("every rail declares what can go wrong, and who can check it", () => {
  // THE MEASURED HALF IS ONLY HALF. `demo-internal` shows zero failures
  // because nothing ever leaves the building — a zero meaning "we never
  // tried" is indistinguishable from one meaning "it always works", and only
  // the declared sentence tells them apart. So the comparison is unsound
  // unless every rail has one.
  //
  // `tsc` already enforces PRESENCE, because the fields are required on the
  // interface. It cannot enforce that they say anything. This does.

  it.each(ALL_RAILS.map((r) => [r.id, r] as const))(
    "%s declares a failure mode that is a sentence, not a placeholder",
    (_id, rail) => {
      expect(rail.failureModes.length).toBeGreaterThan(30);
      expect(rail.failureModes.trim()).toBe(rail.failureModes);
      // A declared danger must be true before the rail has ever been used —
      // which is exactly when an operator needs it and no count exists.
      expect(rail.failureModes).not.toMatch(/TODO|TBD|\bnone\b/i);
    },
  );

  it.each(ALL_RAILS.map((r) => [r.id, r] as const))(
    "%s declares who can verify a settlement on it",
    (_id, rail) => {
      expect(["us-only", "public", "custodian"]).toContain(rail.verifiability);
    },
  );

  it("the three rails do not all give the same answer", () => {
    // If they did, the column would be decoration. The distinction is real:
    // an accounting assertion, a public chain, and a custodian's record are
    // three different things to trust.
    const answers = new Set(ALL_RAILS.map((r) => r.verifiability));
    expect(answers.size).toBe(3);
  });
});

describe("summarise — the order is fixed and is never a ranking", () => {
  it("returns rails in registry order regardless of how fast they are", () => {
    const rows: HistoryRow[] = [
      { rail: "circle-fiat", status: "settled", initiatedAt: new Date(0), resolvedAt: new Date(1) },
      { rail: "demo-internal", status: "settled", initiatedAt: new Date(0), resolvedAt: new Date(999_999) },
    ];
    const order = summarise(rows).map((r) => r.rail);
    // demo-internal is a thousand times slower here and still comes first,
    // because that is its place in the registry. Cycle 3: "ambiguity is a
    // choice presented, never a guess made" — a comparison that sorts by
    // speed has made the choice.
    expect(order).toEqual(["demo-internal", "usdc", "circle-fiat"]);
  });
});

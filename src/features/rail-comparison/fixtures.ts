// SYNTHETIC ROWS for cycle 4's prototype and tests. Never live data — the
// standing rule, and here it matters more than usual: the live figures move
// every time anyone funds a deal, so a test pinned to them would fail for
// reasons that have nothing to do with the code.
//
// Six fixtures, named in the design. FIXTURES 5 AND 6 ARE REGRESSIONS, NOT
// HYPOTHETICALS — the live database produced both on 2026-09-24, the first
// time anything read `pending_settlements`.

import type { HistoryRow } from "@/lib/rails/history";

const T0 = new Date("2026-09-20T10:00:00.000Z");

/** A row, described by how long it took rather than by two timestamps. */
function leg(
  rail: HistoryRow["rail"],
  status: HistoryRow["status"],
  ms: number | null,
  offsetMs = 0,
): HistoryRow {
  const initiatedAt = new Date(T0.getTime() + offsetMs);
  return {
    rail,
    status,
    initiatedAt,
    resolvedAt: ms === null ? null : new Date(initiatedAt.getTime() + ms),
  };
}

/** 1 — the ordinary case: a rail with many settlements.
 *  Durations chosen so the median is unambiguous: sorted, the middle is 4000. */
export const manySettlements: HistoryRow[] = [
  leg("circle-fiat", "settled", 1_000, 0),
  leg("circle-fiat", "settled", 3_000, 10),
  leg("circle-fiat", "settled", 4_000, 20),
  leg("circle-fiat", "settled", 55_000, 30),
  leg("circle-fiat", "settled", 612_000, 40),
];

/** 2 — THE EMPTY RAIL. `usdc` has zero rows in the live database today,
 *  because cycle 1's Base Sepolia legs predate the table. This is a real
 *  state the screen must handle, not a hypothetical one: it must read
 *  "no settlements yet", never 0, never a dash, never "instant". */
export const noHistory: HistoryRow[] = [];

/** 3 — exactly one settlement, where a median is not yet a median. */
export const oneSettlement: HistoryRow[] = [leg("usdc", "settled", 31_000)];

/** 4 — durations spanning three orders of magnitude, so the display format
 *  has to hold from milliseconds to minutes in one column. */
export const wideSpread: HistoryRow[] = [
  leg("demo-internal", "settled", 12),
  leg("demo-internal", "settled", 78, 10),
  leg("demo-internal", "settled", 950, 20),
  leg("demo-internal", "settled", 61_000, 30),
];

/** 5 — AN IMPOSSIBLE DURATION. Written before FIX 1, when `resolvedAt` came
 *  from the application's clock and `initiatedAt` from the database's, about
 *  60 ms apart. On demo-internal, whose whole settlement is 78 ms, the skew
 *  is larger than the measurement. The live median came out at −63 ms. */
export const impossibleDuration: HistoryRow[] = [
  leg("demo-internal", "settled", -27),
  leg("demo-internal", "settled", -55, 10),
  leg("demo-internal", "settled", 78, 20),
];

/** 6 — a leg that did not settle cleanly. In the live data the single such row
 *  carries "REPAIR 2026-09-18: matched deposit a0afd5d4 which had already
 *  settled" — a human's note, not a rail failing. The count is honest; the
 *  COLUMN NAME is what keeps it honest. */
export const didNotSettleCleanly: HistoryRow[] = [
  leg("circle-fiat", "settled", 40_000),
  leg("circle-fiat", "failed", 600_000, 10),
  leg("circle-fiat", "initiated", null, 20),
];

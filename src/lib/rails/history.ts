// WHAT EACH RAIL HAS ACTUALLY DONE — cycle 4.
//
// `pending_settlements` has carried `rail`, `initiatedAt` and `resolvedAt` for
// every leg since cycle 2, because `settleLeg` is rail-neutral (that cycle's
// FIX 1). Thirty-six rows accumulated. NOTHING HAS EVER READ THEM. This module
// is the first reader, and the first read found three things — see below.
//
// WHY THIS IS NOT PROSE ON A DROPDOWN. The pricing screen currently guides the
// rail choice with one sentence: "usually minutes". The measured median is
// 54.9 s and the slowest observed is 10.2 min. The sentence is roughly right
// about the typical case and silent about the one an operator actually needs
// when a debtor is waiting. A claim nobody can check is not a decision aid.
//
// THE ORDER IS FIXED AND IS NEVER A RANKING. Rails come back in registry
// order. Nothing here sorts by speed, scores, or marks a rail preferred —
// cycle 3 settled that principle in code: "ambiguity is a choice presented,
// never a guess made", and a comparison that ranks has made the choice.

import { getDb } from "@/db/client";
import { pendingSettlements } from "@/db/schema";
import { ALL_RAILS, type RailId } from "@/lib/rails";

type PendingRow = typeof pendingSettlements.$inferSelect;

/** The shape the aggregation needs. Narrower than a full row on purpose: a
 *  test should not have to invent an idempotency key to describe a duration. */
export interface HistoryRow {
  rail: RailId;
  status: PendingRow["status"];
  initiatedAt: Date;
  resolvedAt: Date | null;
}

/**
 * How long a rail takes, or an honest statement that we do not know.
 *
 * `known: false` is a separate case rather than a zero or a null, because
 * cycle 3 learned this exact lesson one layer down: an empty list must never
 * read as "nothing arrived". A rail with no settlements has not been fast and
 * has not been slow — it has not been used, and the screen must say so in
 * words.
 */
export type RailDuration =
  | { known: false }
  | { known: true; count: number; medianMs: number; slowestMs: number };

export interface RailHistory {
  rail: RailId;
  label: string;
  /** Legs that reached `settled`. */
  settled: number;
  /**
   * Legs that reached `failed`.
   *
   * DELIBERATELY NOT CALLED "failures". One such row across 36 reads
   * "REPAIR 2026-09-18: matched deposit a0afd5d4 which had already settled" —
   * a human's note about fixing something, not a rail failing. `failureReason`
   * has drifted into a repair log. "Did not settle cleanly" is TRUE of that
   * row, where "rail failure" would not be, so the repair is the name rather
   * than a filter, a rule, or a data migration.
   */
  didNotSettleCleanly: number;
  /** Still in flight — counted, and never mistaken for either of the above. */
  stillOpen: number;
  duration: RailDuration;
  /**
   * Rows whose recorded duration is NEGATIVE, and therefore excluded from
   * every figure above.
   *
   * A duration below zero is not a fast rail; it is a measurement that cannot
   * be true. These rows were written before FIX 1, when `resolvedAt` came from
   * the application's clock and `initiatedAt` from the database's, about 60 ms
   * apart. The screen reports this count rather than quietly dropping them.
   *
   * Note what this rule does NOT need: a cutover timestamp. A hard-coded date
   * would be wrong the moment the fix deploys somewhere at a different hour.
   * Impossibility is self-describing.
   */
  excludedImpossible: number;
}

/** Sorted-middle, not mean. One 10-minute outlier would drag an average up and
 *  misdescribe the typical case; a median says "half were faster than this". */
function median(sorted: number[]): number {
  const n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Pure. The whole aggregation, given rows — so every edge this feature has to
 * survive can be tested without a database: a rail with no history, a rail
 * with exactly one settlement, durations spanning milliseconds to minutes, and
 * an impossible duration.
 */
export function summarise(rows: readonly HistoryRow[]): RailHistory[] {
  return ALL_RAILS.map((rail) => {
    const mine = rows.filter((r) => r.rail === rail.id);

    let settled = 0;
    let didNotSettleCleanly = 0;
    let stillOpen = 0;
    let excludedImpossible = 0;
    const durations: number[] = [];

    for (const row of mine) {
      const ms =
        row.resolvedAt === null ? null : row.resolvedAt.getTime() - row.initiatedAt.getTime();

      // An impossible measurement is excluded from EVERY figure, including the
      // counts — a row we cannot trust about time is not evidence about
      // outcome either, and counting it in one column but not the other would
      // make the columns disagree.
      if (ms !== null && ms < 0) {
        excludedImpossible += 1;
        continue;
      }

      if (row.status === "settled") {
        settled += 1;
        if (ms !== null) durations.push(ms);
      } else if (row.status === "failed") {
        didNotSettleCleanly += 1;
      } else {
        stillOpen += 1;
      }
    }

    durations.sort((a, b) => a - b);

    return {
      rail: rail.id,
      label: rail.label,
      settled,
      didNotSettleCleanly,
      stillOpen,
      duration:
        durations.length === 0
          ? { known: false }
          : {
              known: true,
              count: durations.length,
              medianMs: median(durations),
              slowestMs: durations[durations.length - 1],
            },
      excludedImpossible,
    };
  });
}

/**
 * Every rail's history, in registry order.
 *
 * Reads `pending_settlements` and nothing else. It does not touch the ledger,
 * does not call a rail, and books nothing — this whole feature has no
 * consequence, which is the property eval case 5 exists to prove.
 */
export async function loadRailHistory(): Promise<RailHistory[]> {
  const db = getDb();
  const rows = await db
    .select({
      rail: pendingSettlements.rail,
      status: pendingSettlements.status,
      initiatedAt: pendingSettlements.initiatedAt,
      resolvedAt: pendingSettlements.resolvedAt,
    })
    .from(pendingSettlements);

  return summarise(rows);
}

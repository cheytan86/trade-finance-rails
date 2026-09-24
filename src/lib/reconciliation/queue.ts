// THE QUEUE — what money has arrived, and what the ledger says about it.
//
// TWO SOURCES, AND ONLY ONE OF THEM IS ABOUT THE MONEY.
//
//   the rail    what arrived: amount, when, from whom. Never copied into our
//               tables and trusted — the rail is the record of what it holds.
//   the ledger  what we have DONE about it, derived by SUM. Never a status
//               column: balances are SUM(entries) and a deal's status is
//               derived from its booked legs, so a stored attribution state
//               would be a fourth place money state lives, and it would drift.
//
// WHY NOT `webhook_deliveries`. It would be cheaper and it is already local.
// It is also provably incomplete: the delivery log's earliest row is
// 2026-09-18T06:03:46 and two unattributed deposits arrived on 2026-09-15, so
// a queue built from deliveries CANNOT contain them. Cycle 2 also proved the
// log can be silently wrong — the SNS defect refused every genuine
// notification until Deploy found it. A reconciliation screen that can be
// quietly incomplete is worse than none, because ops will trust it.

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ledgerEntries, settlementEvents } from "@/db/schema";
import { ALL_RAILS, railFor, type InboundPayment, type RailId } from "@/lib/rails";

export interface QueuedPayment {
  payment: InboundPayment;
  /** SUM of movements booked against this payment's rail reference. */
  attributedMinor: bigint;
  /** What is still free to attribute. Never negative. */
  unattributedMinor: bigint;
  state: "unattributed" | "part-attributed" | "attributed";
  /** Which deals this payment has already settled, if any. */
  bookedAgainst: Array<{ invoiceId: string; legType: string }>;
}

/**
 * THREE ANSWERS, AND THE LAST TWO ARE NOT THE SAME.
 *
 *   ok           we asked and here is what the rail holds
 *   unsupported  this rail has no outside — no money can arrive, ever
 *   unreachable  we COULD NOT ASK
 *
 * Collapsing `unreachable` into either of the others is the exact failure this
 * cycle exists to remove. An empty table would say "nothing arrived"; an
 * "unsupported" card would say "nothing can arrive". Both are false when the
 * truth is "Circle did not answer", and money may well be sitting there.
 */
export type QueueResult =
  | {
      status: "ok";
      rail: RailId;
      payments: QueuedPayment[];
      /** Totals, computed over the whole list rather than the rendered page. */
      totals: { count: number; unattributedCount: number; unattributedMinor: bigint };
    }
  | { status: "unsupported"; rail: RailId; reason: string }
  | { status: "unreachable"; rail: RailId; reason: string };

/**
 * Every movement already booked against a rail reference, with the deal it
 * settled. The movement's magnitude is the POSITIVE side of its entries: a
 * movement is two or more entries summing to zero, so the positive half is
 * what moved. Reading it this way rather than storing an amount on the event
 * keeps the ledger the only place an amount lives.
 */
async function bookedByReference(): Promise<
  Map<string, { total: bigint; legs: Array<{ invoiceId: string; legType: string }> }>
> {
  const db = getDb();
  const rows = await db
    .select({
      reference: settlementEvents.evidenceRef,
      invoiceId: settlementEvents.invoiceId,
      legType: settlementEvents.type,
      moved: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.amountMinor} > 0), 0)`,
    })
    .from(settlementEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, settlementEvents.id))
    .groupBy(settlementEvents.evidenceRef, settlementEvents.invoiceId, settlementEvents.type);

  const out = new Map<
    string,
    { total: bigint; legs: Array<{ invoiceId: string; legType: string }> }
  >();
  for (const r of rows) {
    const entry = out.get(r.reference) ?? { total: 0n, legs: [] };
    entry.total += BigInt(r.moved);
    entry.legs.push({ invoiceId: r.invoiceId, legType: r.legType });
    out.set(r.reference, entry);
  }
  return out;
}

/**
 * The queue for one rail.
 *
 * A rail that cannot list inbound payments answers `supported: false` and the
 * screen says so. It must never render as an empty list — "we could not ask"
 * and "nothing arrived" are different statements, and only one of them is
 * true.
 */
/**
 * HOW LONG A SCREEN WILL WAIT FOR A RAIL — a deploy blocker, cleared at D2.
 *
 * `listInbound()` is a network call with no timeout anywhere beneath it, and
 * the ops deal book now depends on it. A DEAD rail fails in milliseconds; a
 * SLOW one would hang the busiest screen in the product until the serverless
 * function itself timed out, and the person would see nothing at all rather
 * than a deal book with one unhappy card.
 *
 * Measured from this machine, 2026-09-24: Circle answers in 0.47–0.65 s. Four
 * seconds is roughly six times the worst measurement — generous enough never
 * to fire on a healthy call, short enough that a page still renders.
 *
 * A timeout is reported as `unreachable`, never as `unsupported` and never as
 * an empty list: we could not ask, and money may be sitting there.
 */
const RAIL_TIMEOUT_MS = 4_000;

export async function loadQueue(railId: RailId): Promise<QueueResult> {
  const rail = railFor(railId);

  let listing;
  try {
    listing = await Promise.race([
      rail.listInbound(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`no answer within ${RAIL_TIMEOUT_MS / 1000}s`)),
          RAIL_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    // A rail that cannot be reached is not a rail with nothing in it. The
    // screen must say which, because money may be sitting there unseen.
    return {
      status: "unreachable",
      rail: railId,
      reason: `We could not reach this rail to ask what has arrived${
        err instanceof Error ? ` — ${err.message}` : ""
      }. Money may have arrived that is not shown here.`,
    };
  }
  if (!listing.supported) {
    return { status: "unsupported", rail: railId, reason: listing.reason };
  }

  const booked = await bookedByReference();

  const payments: QueuedPayment[] = listing.payments
    .map((payment) => {
      const hit = booked.get(payment.reference);
      const attributedMinor = hit?.total ?? 0n;
      const left = payment.amountMinor - attributedMinor;
      const unattributedMinor = left > 0n ? left : 0n;
      return {
        payment,
        attributedMinor,
        unattributedMinor,
        state:
          attributedMinor <= 0n
            ? ("unattributed" as const)
            : attributedMinor >= payment.amountMinor
              ? ("attributed" as const)
              : ("part-attributed" as const),
        bookedAgainst: hit?.legs ?? [],
      };
    })
    .sort((a, b) => b.payment.arrivedAt.getTime() - a.payment.arrivedAt.getTime());

  // A failed payment is not money and is not counted — it is shown so that
  // "where did that go?" has an answer, and excluded from every total.
  const live = payments.filter((p) => p.payment.status !== "failed");
  const open = live.filter((p) => p.unattributedMinor > 0n);

  return {
    status: "ok",
    rail: railId,
    payments,
    totals: {
      count: live.length,
      unattributedCount: open.length,
      unattributedMinor: open.reduce((t, p) => t + p.unattributedMinor, 0n),
    },
  };
}

/** One payment by its rail reference, for the attribution screen. */
export async function loadPayment(
  railId: RailId,
  reference: string,
): Promise<QueuedPayment | null> {
  const result = await loadQueue(railId);
  if (result.status !== "ok") return null;
  return result.payments.find((p) => p.payment.reference === reference) ?? null;
}

/**
 * EVERY RAIL, ASKED IN TURN — cycle 3's answer to "where does money arrive?".
 *
 * The page used to hard-code `circle-fiat`. That was invisible while only one
 * rail had an outside, and it would have become a defect the moment a second
 * one did: money arrives, the rail knows, and nothing asks. Worse, it made the
 * `unsupported` branch unreachable — so a person funding a demo-internal deal
 * saw a queue full of OTHER people's payments and no explanation of why theirs
 * was absent. That is how this loop came to be written.
 *
 * Rails that cannot receive money still appear, each carrying its reason. The
 * screen is then honest about its own scope without anybody having to know the
 * architecture.
 */
export async function loadAllQueues(): Promise<QueueResult[]> {
  // Promise.all would have let ONE unreachable rail take down the whole
  // screen — including the two rails that need no network to answer. Each
  // rail reports for itself.
  return Promise.all(
    ALL_RAILS.map(async (rail) => {
      try {
        return await loadQueue(rail.id);
      } catch (err) {
        return {
          status: "unreachable" as const,
          rail: rail.id,
          reason: `We could not reach this rail${
            err instanceof Error ? ` — ${err.message}` : ""
          }. Money may have arrived that is not shown here.`,
        };
      }
    }),
  );
}

/**
 * Which rail holds this payment reference, if any.
 *
 * References are rail-specific, so the rail is DISCOVERED rather than assumed.
 * The alternative — passing a rail id through the URL — would let the browser
 * choose which rail the server consults, and the browser posts decisions, not
 * lookups.
 */
export async function findPayment(
  reference: string,
): Promise<{ rail: RailId; queued: QueuedPayment } | null> {
  for (const result of await loadAllQueues()) {
    if (result.status !== "ok") continue;
    const hit = result.payments.find((p) => p.payment.reference === reference);
    if (hit) return { rail: result.rail, queued: hit };
  }
  return null;
}

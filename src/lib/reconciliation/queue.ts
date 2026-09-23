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
import { railFor, type InboundPayment, type RailId } from "@/lib/rails";

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

export type QueueResult =
  | {
      supported: true;
      rail: RailId;
      payments: QueuedPayment[];
      /** Totals, computed over the whole list rather than the rendered page. */
      totals: { count: number; unattributedCount: number; unattributedMinor: bigint };
    }
  | { supported: false; rail: RailId; reason: string };

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
export async function loadQueue(railId: RailId): Promise<QueueResult> {
  const rail = railFor(railId);
  const listing = await rail.listInbound();
  if (!listing.supported) {
    return { supported: false, rail: railId, reason: listing.reason };
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
    supported: true,
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
  if (!result.supported) return null;
  return result.payments.find((p) => p.payment.reference === reference) ?? null;
}

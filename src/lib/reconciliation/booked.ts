// Movements already booked against one leg, read from the ledger.
//
// A movement's magnitude is the POSITIVE side of its entries: entries sum to
// zero, so the positive half is what moved. Reading it this way rather than
// storing an amount on the event keeps the ledger the only place an amount
// lives — the same rule balances follow.

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { ledgerEntries, settlementEvents } from "@/db/schema";
import type { BookedMovement } from "@/features/reconciliation-ops/attribution";

export async function loadBookedOnLeg(
  invoiceId: string,
  legType: string,
): Promise<BookedMovement[]> {
  const db = getDb();
  const rows = await db
    .select({
      eventId: settlementEvents.id,
      moved: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.amountMinor} > 0), 0)`,
    })
    .from(settlementEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, settlementEvents.id))
    .where(
      and(
        eq(settlementEvents.invoiceId, invoiceId),
        eq(settlementEvents.type, legType as typeof settlementEvents.$inferSelect.type),
      ),
    )
    .groupBy(settlementEvents.id);

  return rows.map((r) => ({ amountMinor: BigInt(r.moved) }));
}

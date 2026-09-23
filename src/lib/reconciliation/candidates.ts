// WHAT COULD THIS PAYMENT BE FOR?
//
// The one thing this module must never do is ANSWER that question. It gathers
// the legs a payment could plausibly settle, computes what each still needs,
// and hands both to a person. It does not rank them, does not score them, and
// does not pre-select one.
//
// That restraint is the requirement, not a limitation. Two deposits of $100
// from the same sender minutes apart are genuinely indistinguishable, and a
// product that picks one has invented information it does not have — which is
// precisely how a real repayment was lost at cycle 2 (defect 6). The honest
// answer is "these two, you decide", and honesty here is deterministic.
//
// ORDERING IS BY MATURITY, NOT BY LIKELIHOOD. Earliest due date first, because
// that is the escalation ladder's last rung when the payer cannot be reached —
// a stated policy rather than a guess dressed as one. It is a reading order,
// not a recommendation, and the screen says so.

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accounts,
  invoices,
  ledgerEntries,
  parties,
  pendingSettlements,
  settlementEvents,
} from "@/db/schema";
import { parseStoredEntries } from "@/lib/settlement/pending";
import type { InboundPayment, RailId } from "@/lib/rails";
import {
  attributableAmount,
  refuseAttribution,
  type BookedMovement,
  type OpenLeg,
} from "@/features/reconciliation-ops/attribution";

export interface Candidate {
  leg: OpenLeg;
  invoice: {
    id: string;
    supplier: string;
    debtor: string;
    faceValueMinor: bigint;
    dueDate: string;
    status: string;
  };
  /** What this leg still needs, derived from movements already booked. */
  outstandingMinor: bigint;
  /** What a full attribution would move — the lesser of free and outstanding. */
  wouldMoveMinor: bigint;
  /** Non-null when this leg cannot take this money, with the reason to show. */
  refusal: { rule: string; message: string } | null;
  /** THE EXACT ENTRIES a full attribution would book, labelled and scaled,
   *  computed on the SERVER. The gate shows these before anything books —
   *  and the action recomputes them, so what is displayed is never what is
   *  trusted. Amounts are strings: bigint cannot cross to the client. */
  displayEntries: Array<{ label: string; amountMinor: string }>;
}

/** Movements booked per leg, keyed `${type}:${invoiceId}`. The magnitude is
 *  the positive side of the entries, for the same reason as in queue.ts: a
 *  movement's amount lives in the ledger, not on the event. */
async function bookedPerLeg(invoiceIds: string[]): Promise<Map<string, BookedMovement[]>> {
  const out = new Map<string, BookedMovement[]>();
  if (invoiceIds.length === 0) return out;
  const db = getDb();
  const rows = await db
    .select({
      invoiceId: settlementEvents.invoiceId,
      legType: settlementEvents.type,
      moved: sql<string>`coalesce(sum(${ledgerEntries.amountMinor}) filter (where ${ledgerEntries.amountMinor} > 0), 0)`,
    })
    .from(settlementEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, settlementEvents.id))
    .where(inArray(settlementEvents.invoiceId, invoiceIds))
    .groupBy(settlementEvents.invoiceId, settlementEvents.type);

  for (const r of rows) {
    const key = `${r.legType}:${r.invoiceId}`;
    const list = out.get(key) ?? [];
    list.push({ amountMinor: BigInt(r.moved) });
    out.set(key, list);
  }
  return out;
}

/**
 * Every leg this payment could settle, with its refusal where it could not.
 *
 * Legs that cannot take the money are INCLUDED, carrying their reason. A
 * candidate list that silently omits them tells ops the leg does not exist;
 * one that shows the refusal tells them why, which is the difference between
 * a screen they trust and a screen they route around.
 */
export async function loadCandidates(
  railId: RailId,
  payment: InboundPayment,
  bookedAgainstPayment: readonly BookedMovement[],
): Promise<Candidate[]> {
  const db = getDb();

  const legs = await db
    .select()
    .from(pendingSettlements)
    .where(
      and(
        eq(pendingSettlements.rail, railId),
        inArray(pendingSettlements.status, ["initiating", "initiated"]),
      ),
    );
  if (legs.length === 0) return [];

  const invoiceIds = [...new Set(legs.map((l) => l.invoiceId))];
  const booked = await bookedPerLeg(invoiceIds);

  const supplierParty = parties;
  const rows = await db
    .select({
      id: invoices.id,
      supplier: supplierParty.name,
      faceValueMinor: invoices.faceValueMinor,
      dueDate: invoices.dueDate,
      status: invoices.status,
      debtorId: invoices.debtorId,
    })
    .from(invoices)
    .innerJoin(supplierParty, eq(supplierParty.id, invoices.supplierId))
    .where(inArray(invoices.id, invoiceIds));

  const debtorRows = await db.select({ id: parties.id, name: parties.name }).from(parties);
  const debtorName = new Map(debtorRows.map((d) => [d.id, d.name]));
  const invoiceById = new Map(rows.map((r) => [r.id, r]));

  // Account labels for the gate. An entry that reads "acc-4f2b…" tells a
  // person nothing, and a gate nobody can read is a gate nobody uses.
  const accountRows = await db
    .select({ id: accounts.id, kind: accounts.kind, partyId: accounts.partyId })
    .from(accounts);
  const accountLabel = new Map(
    accountRows.map((a) => [
      a.id,
      a.partyId
        ? `${a.kind} · ${debtorName.get(a.partyId) ?? "—"}`
        : String(a.kind),
    ]),
  );

  const candidates: Candidate[] = [];
  for (const leg of legs) {
    const inv = invoiceById.get(leg.invoiceId);
    if (!inv) continue;
    const bookedAgainstLeg = booked.get(`${leg.type}:${leg.invoiceId}`) ?? [];
    const facts = {
      payment: { ...payment, amountMinor: payment.amountMinor },
      bookedAgainstPayment,
      leg,
      bookedAgainstLeg,
    };
    const refusal = refuseAttribution(facts, 1n);
    candidates.push({
      leg,
      invoice: {
        id: inv.id,
        supplier: inv.supplier,
        debtor: debtorName.get(inv.debtorId) ?? "—",
        faceValueMinor: inv.faceValueMinor,
        dueDate: String(inv.dueDate),
        status: String(inv.status),
      },
      outstandingMinor:
        leg.amountMinor - bookedAgainstLeg.reduce((t, m) => t + m.amountMinor, 0n),
      wouldMoveMinor: attributableAmount(facts),
      refusal: refusal ? { rule: refusal.rule, message: refusal.message } : null,
      displayEntries: scaledDisplayEntries(
        leg,
        attributableAmount(facts),
        accountLabel,
      ),
    });
  }

  // Earliest maturity first — the ladder's last rung, and a reading order
  // rather than a recommendation. Legs that cannot take the money sink to the
  // bottom so the eye lands on the real choices first, without ranking those.
  return candidates.sort((a, b) => {
    if (Boolean(a.refusal) !== Boolean(b.refusal)) return a.refusal ? 1 : -1;
    return a.invoice.dueDate.localeCompare(b.invoice.dueDate);
  });
}

/**
 * The leg's FROZEN entries, scaled to what would actually move, labelled for a
 * person. Mirrors scaleEntries() in actions.ts deliberately: the gate must show
 * what the action will book, and the action recomputes it rather than trusting
 * this. Returns empty when the split would invent a penny — the action refuses
 * that case, and the gate must not promise it.
 */
function scaledDisplayEntries(
  leg: OpenLeg,
  toMinor: bigint,
  label: Map<string, string>,
): Array<{ label: string; amountMinor: string }> {
  if (toMinor <= 0n || leg.amountMinor <= 0n) return [];
  let entries;
  try {
    entries = parseStoredEntries(leg.entries);
  } catch {
    return [];
  }
  const scaled = entries.map((e) => ({
    accountId: e.accountId,
    amountMinor: (e.amountMinor * toMinor) / leg.amountMinor,
  }));
  if (scaled.reduce((t, e) => t + e.amountMinor, 0n) !== 0n) return [];
  if (scaled.some((e) => e.amountMinor === 0n)) return [];
  return scaled.map((e) => ({
    label: label.get(e.accountId) ?? e.accountId.slice(0, 8),
    amountMinor: e.amountMinor.toString(),
  }));
}

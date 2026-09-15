// Read-side queries for the role surfaces. Server components only — nothing
// here is imported by client code. Writes never live here: money movements go
// through src/lib/ledger, state changes through the route actions (A5).

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import {
  parties,
  invoices,
  accounts,
  settlementEvents,
  ledgerEntries,
  pendingSettlements,
} from "@/db/schema";
import { balances, balanceOf, isClientMoney } from "@/lib/ledger";

const supplierParty = alias(parties, "supplier_party");
const debtorParty = alias(parties, "debtor_party");

export async function allDebtors() {
  const db = getDb();
  return db
    .select({ id: parties.id, name: parties.name })
    .from(parties)
    .where(eq(parties.role, "debtor"))
    .orderBy(asc(parties.name));
}

/**
 * The four accounts the cycle-0 movements touch, with display labels — so a
 * gate dialog can show the same entries the action will book.
 */
export async function accountRefsFor(supplierId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: accounts.id, kind: accounts.kind, partyId: accounts.partyId, partyName: parties.name })
    .from(accounts)
    .leftJoin(parties, eq(accounts.partyId, parties.id));
  const pick = (kind: string, partyId: string | null) => {
    const r = rows.find((x) => x.kind === kind && x.partyId === partyId);
    return r ? { id: r.id, label: accountLabel(r.kind, r.partyName) } : null;
  };
  // One funder in cycle 0 (multiple funders arrive with the funding-models
  // cycle); sorted so the choice is deterministic rather than row-order luck.
  const funderCashRow = rows
    .filter((r) => r.kind === "funder_cash")
    .sort((a, b) => (a.partyName ?? "").localeCompare(b.partyName ?? ""))[0];
  return {
    funderCash: funderCashRow
      ? { id: funderCashRow.id, label: accountLabel(funderCashRow.kind, funderCashRow.partyName) }
      : null,
    clientCollections: pick("client_collections", null),
    supplierPayable: pick("supplier_payable", supplierId),
    platformOperating: pick("platform_operating", null),
    // Keyed by debtor: the /pay page resolves its own payer.
    debtorCash: Object.fromEntries(
      rows
        .filter((r) => r.kind === "debtor_cash" && r.partyId)
        .map((r) => [r.partyId!, { id: r.id, label: accountLabel(r.kind, r.partyName) }]),
    ) as Record<string, { id: string; label: string }>,
  };
}

/**
 * Which party a seat is acting for — the ONE resolution rule, used by the
 * pages and by the actions alike. A cookie's party id is honoured only if it
 * names a real party of that role; anything else falls back to the first by
 * name. Page and action must agree, or a screen says "acting as X" while the
 * action refuses — which is exactly the inconsistency this replaced.
 */
export async function resolvePartyForSeat(
  role: "supplier" | "funder",
  claimedPartyId: string | null | undefined,
) {
  const db = getDb();
  const candidates = await db
    .select()
    .from(parties)
    .where(eq(parties.role, role))
    .orderBy(asc(parties.name));
  return candidates.find((p) => p.id === claimedPartyId) ?? candidates[0] ?? null;
}

export async function allSuppliers() {
  const db = getDb();
  return db
    .select()
    .from(parties)
    .where(eq(parties.role, "supplier"))
    .orderBy(asc(parties.name));
}

export async function invoicesForSupplier(supplierId: string) {
  const db = getDb();
  return db
    .select({ invoice: invoices, debtorName: debtorParty.name })
    .from(invoices)
    .innerJoin(debtorParty, eq(invoices.debtorId, debtorParty.id))
    .where(eq(invoices.supplierId, supplierId))
    .orderBy(desc(invoices.createdAt));
}

export async function allInvoices() {
  const db = getDb();
  return db
    .select({
      invoice: invoices,
      supplierName: supplierParty.name,
      debtorName: debtorParty.name,
    })
    .from(invoices)
    .innerJoin(supplierParty, eq(invoices.supplierId, supplierParty.id))
    .innerJoin(debtorParty, eq(invoices.debtorId, debtorParty.id))
    .orderBy(desc(invoices.createdAt));
}

export async function invoiceDetail(id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      invoice: invoices,
      supplierName: supplierParty.name,
      debtorName: debtorParty.name,
    })
    .from(invoices)
    .innerJoin(supplierParty, eq(invoices.supplierId, supplierParty.id))
    .innerJoin(debtorParty, eq(invoices.debtorId, debtorParty.id))
    .where(eq(invoices.id, id));
  return row;
}

/** Follows the schema enum automatically — new event types never need a manual edit here. */
type MovementType = (typeof settlementEvents.$inferSelect)["type"];

export interface MovementView {
  eventId: string;
  type: MovementType;
  evidenceKind: string;
  evidenceRef: string;
  createdAt: Date;
  invoiceId: string;
  entries: Array<{ accountLabel: string; amountMinor: bigint }>;
}

function accountLabel(kind: string, partyName: string | null): string {
  return partyName ? `${kind} · ${partyName}` : kind;
}

export async function movementsForInvoice(invoiceId: string): Promise<MovementView[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: settlementEvents,
      amountMinor: ledgerEntries.amountMinor,
      kind: accounts.kind,
      partyName: parties.name,
    })
    .from(settlementEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, settlementEvents.id))
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .leftJoin(parties, eq(accounts.partyId, parties.id))
    .where(eq(settlementEvents.invoiceId, invoiceId))
    .orderBy(asc(settlementEvents.createdAt));
  return groupMovements(rows);
}

export async function allMovements(): Promise<MovementView[]> {
  const db = getDb();
  const rows = await db
    .select({
      event: settlementEvents,
      amountMinor: ledgerEntries.amountMinor,
      kind: accounts.kind,
      partyName: parties.name,
    })
    .from(settlementEvents)
    .innerJoin(ledgerEntries, eq(ledgerEntries.eventId, settlementEvents.id))
    .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
    .leftJoin(parties, eq(accounts.partyId, parties.id))
    .orderBy(desc(settlementEvents.createdAt));
  return groupMovements(rows);
}

function groupMovements(
  rows: Array<{
    event: typeof settlementEvents.$inferSelect;
    amountMinor: bigint;
    kind: string;
    partyName: string | null;
  }>,
): MovementView[] {
  const byId = new Map<string, MovementView>();
  for (const r of rows) {
    let m = byId.get(r.event.id);
    if (!m) {
      m = {
        eventId: r.event.id,
        type: r.event.type,
        evidenceKind: r.event.evidenceKind,
        evidenceRef: r.event.evidenceRef,
        createdAt: r.event.createdAt,
        invoiceId: r.event.invoiceId,
        entries: [],
      };
      byId.set(r.event.id, m);
    }
    m.entries.push({
      accountLabel: accountLabel(r.kind, r.partyName),
      amountMinor: r.amountMinor,
    });
  }
  return [...byId.values()];
}

export async function chartWithBalances() {
  const db = getDb();
  const chart = await db
    .select({ account: accounts, partyName: parties.name })
    .from(accounts)
    .leftJoin(parties, eq(accounts.partyId, parties.id))
    .orderBy(asc(accounts.kind));
  const sums = await balances(db);
  return chart.map((c) => ({
    id: c.account.id,
    label: accountLabel(c.account.kind, c.partyName),
    kind: c.account.kind,
    balanceMinor: sums.get(c.account.id) ?? 0n,
  }));
}

export async function funderPositions(funderId: string) {
  const db = getDb();
  const deals = await db
    .select({
      invoice: invoices,
      supplierName: supplierParty.name,
      debtorName: debtorParty.name,
    })
    .from(invoices)
    .innerJoin(supplierParty, eq(invoices.supplierId, supplierParty.id))
    .innerJoin(debtorParty, eq(invoices.debtorId, debtorParty.id))
    .where(inArray(invoices.status, ["funded", "disbursed"]))
    .orderBy(desc(invoices.createdAt));
  const [cash] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.partyId, funderId), eq(accounts.kind, "funder_cash")));
  const cashBalance = cash ? await balanceOf(db, cash.id) : 0n;
  return { deals, cashBalance };
}

export async function latestPayableInvoiceId(): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(inArray(invoices.status, ["disbursed", "funded", "approved", "submitted"]))
    .orderBy(desc(invoices.createdAt))
    .limit(1);
  return row?.id ?? null;
}


/**
 * OPEN IN-FLIGHT LEGS — what the in-flight strip, the ops queue and the ledger
 * panel all render. Deliberately a separate read from the ledger: these are
 * movements that have NOT booked, and mixing them into a balance query is
 * exactly the mistake the separate table exists to prevent.
 */
export async function openLegs(invoiceIds?: string[]) {
  const db = getDb();
  const rows = await db
    .select({
      leg: pendingSettlements,
      invoiceNumber: invoices.invoiceNumber,
      supplierName: parties.name,
    })
    .from(pendingSettlements)
    .leftJoin(invoices, eq(pendingSettlements.invoiceId, invoices.id))
    .leftJoin(parties, eq(invoices.supplierId, parties.id))
    .orderBy(asc(pendingSettlements.initiatedAt));
  return rows
    .filter((r) => r.leg.status === "initiating" || r.leg.status === "initiated")
    .filter((r) => !invoiceIds || invoiceIds.includes(r.leg.invoiceId));
}

/** Every leg for one deal, open or resolved — the deal page shows both. */
export async function legsForInvoice(invoiceId: string) {
  const db = getDb();
  return db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.invoiceId, invoiceId))
    .orderBy(asc(pendingSettlements.initiatedAt));
}

/** Balances split into client money and the platform's own (cycle 2, FIX 2). */
export async function chartByOwnership() {
  const chart = await chartWithBalances();
  return {
    clientMoney: chart.filter((a) => isClientMoney(a.kind)),
    // fee_income is retired and holds nothing, so an empty account is not
    // rendered as a row that invites a question with no answer.
    platformOwn: chart.filter((a) => !isClientMoney(a.kind) && a.balanceMinor !== 0n),
  };
}

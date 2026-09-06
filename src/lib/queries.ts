// Read-side queries for the role surfaces. Server components only — nothing
// here is imported by client code. Writes never live here: money movements go
// through src/lib/ledger, state changes through the route actions (A5).

import { asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import { parties, invoices, accounts, settlementEvents, ledgerEntries } from "@/db/schema";
import { balances } from "@/lib/ledger";

const supplierParty = alias(parties, "supplier_party");
const debtorParty = alias(parties, "debtor_party");

/** A3 stand-in for identity: the demo acts as the first supplier until the
 *  getIdentity() seam lands in A4. Deterministic: alphabetical. */
export async function demoSupplier() {
  const db = getDb();
  const [p] = await db
    .select()
    .from(parties)
    .where(eq(parties.role, "supplier"))
    .orderBy(asc(parties.name))
    .limit(1);
  return p;
}

export async function demoFunder() {
  const db = getDb();
  const [p] = await db
    .select()
    .from(parties)
    .where(eq(parties.role, "funder"))
    .orderBy(asc(parties.name))
    .limit(1);
  return p;
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

export interface MovementView {
  eventId: string;
  type: "funding" | "disbursement";
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
    .where(eq(accounts.partyId, funderId));
  const cashBalance = cash ? await balanceOfAccount(cash.id) : 0n;
  return { deals, cashBalance };
}

async function balanceOfAccount(accountId: string): Promise<bigint> {
  const db = getDb();
  const sums = await balances(db);
  return sums.get(accountId) ?? 0n;
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

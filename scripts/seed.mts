// Synthetic backdrop for the demo — companies invented for this repo, never a
// real person or business. Run: node scripts/seed.mts   (Node ≥ 23 strips types)
//
// Idempotent by wipe-and-refill: this is demo seed, not a migration.
//
// A1 seeds parties, the account chart, and invoices in submitted / approved /
// refused states only. Funded and disbursed backdrop arrives in A2 *through
// src/lib/ledger* — the sole writer of entries — so the seed can never book a
// movement the invariant module didn't check.

process.loadEnvFile(".env.local");

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  parties,
  accounts,
  invoices,
  settlementEvents,
  ledgerEntries,
} from "../src/db/schema.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing from .env.local");
const db = drizzle(neon(url));

function isoDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// Wipe in FK order.
await db.delete(ledgerEntries);
await db.delete(settlementEvents);
await db.delete(invoices);
await db.delete(accounts);
await db.delete(parties);

const [platform] = await db
  .insert(parties)
  .values({ name: "Trade Finance Rails (platform)", role: "platform" })
  .returning();
const [amber, ostrava] = await db
  .insert(parties)
  .values([
    { name: "Amber Textiles Ltd", role: "supplier" },
    { name: "Ostrava Components s.r.o.", role: "supplier" },
  ])
  .returning();
const [northgate] = await db
  .insert(parties)
  .values({ name: "Northgate Capital Partners", role: "funder" })
  .returning();
const [meridian, halvorsen, coralline] = await db
  .insert(parties)
  .values([
    { name: "Meridian Retail Group Ltd", role: "debtor" },
    { name: "Halvorsen Logistics AS", role: "debtor" },
    { name: "Coralline Foods plc", role: "debtor" },
  ])
  .returning();

// The chart of accounts. No balance column exists to fill — that is the point.
const chart = await db
  .insert(accounts)
  .values([
    { kind: "funder_cash", partyId: northgate.id, currency: "USD" },
    { kind: "platform_treasury", partyId: null, currency: "USD" },
    { kind: "supplier_payable", partyId: amber.id, currency: "USD" },
    { kind: "supplier_payable", partyId: ostrava.id, currency: "USD" },
    { kind: "fee_income", partyId: null, currency: "USD" },
  ])
  .returning();
const acct = (kind: string, partyId: string | null = null) => {
  const a = chart.find((c) => c.kind === kind && c.partyId === partyId);
  if (!a) throw new Error(`seed: missing account ${kind}`);
  return a.id;
};

// Backdrop invoices. Amounts are bigint minor units (cents).
await db.insert(invoices).values([
  {
    supplierId: amber.id,
    debtorId: meridian.id,
    faceValueMinor: 54_000_00n,
    dueDate: isoDaysFromNow(30),
    status: "submitted",
  },
  {
    supplierId: ostrava.id,
    debtorId: coralline.id,
    faceValueMinor: 12_400_00n,
    dueDate: isoDaysFromNow(45),
    status: "submitted",
  },
  {
    supplierId: amber.id,
    debtorId: halvorsen.id,
    faceValueMinor: 18_200_00n,
    dueDate: isoDaysFromNow(60),
    status: "approved",
    advanceRateBps: 8500,
    supplierRateBps: 950,
    funderRateBps: 800,
    txnCostType: "fixed",
    txnCostValue: 150_00n,
  },
  {
    supplierId: ostrava.id,
    debtorId: meridian.id,
    faceValueMinor: 97_500_00n,
    dueDate: isoDaysFromNow(20),
    status: "refused",
    refusalReason:
      "Face value exceeds the supplier's demo eligibility cap (rule demo-cap-01).",
  },
]);

// ── funded + disbursed backdrop — booked THROUGH the ledger module, the sole
// writer, so the seed can never place an unbalanced movement. Snapshots come
// from the pricing module so every amount is internally consistent.

const { computePricing, snapshotToJson } = await import("../src/lib/pricing/index.ts");
const { bookMovement } = await import("../src/lib/ledger/index.ts");
const { getDb } = await import("../src/db/client.ts");
const ldb = getDb();

// Funded: Ostrava → Halvorsen, 20,000.00, snapshot locked at seed time.
{
  const terms = {
    faceValueMinor: 20_000_00n,
    dueDate: isoDaysFromNow(45),
    advanceRateBps: 8500,
    supplierRateBps: 950,
    funderRateBps: 800,
    txnCostType: "fixed" as const,
    txnCostValue: 150_00n,
  };
  const snap = computePricing(terms, new Date());
  const [inv] = await db
    .insert(invoices)
    .values({
      supplierId: ostrava.id,
      debtorId: halvorsen.id,
      faceValueMinor: terms.faceValueMinor,
      dueDate: terms.dueDate,
      status: "funded",
      advanceRateBps: terms.advanceRateBps,
      supplierRateBps: terms.supplierRateBps,
      funderRateBps: terms.funderRateBps,
      txnCostType: terms.txnCostType,
      txnCostValue: terms.txnCostValue,
      pricingSnapshot: snapshotToJson(snap),
    })
    .returning();
  await bookMovement(ldb, {
    invoiceId: inv.id,
    type: "funding",
    evidenceRef: `demo:seed:funding:${inv.id.slice(0, 8)}`,
    idempotencyKey: `funding:${inv.id}`,
    entries: [
      { accountId: acct("funder_cash", northgate.id), amountMinor: -snap.principalMinor },
      { accountId: acct("platform_treasury"), amountMinor: snap.principalMinor },
    ],
  });
}

// Disbursed: Amber → Meridian, 32,500.00, financed 50 days ago.
{
  const terms = {
    faceValueMinor: 32_500_00n,
    dueDate: isoDaysFromNow(10),
    advanceRateBps: 8500,
    supplierRateBps: 950,
    funderRateBps: 800,
    txnCostType: "fixed" as const,
    txnCostValue: 150_00n,
  };
  const snap = computePricing(terms, new Date(Date.now() - 50 * 86_400_000));
  const [inv] = await db
    .insert(invoices)
    .values({
      supplierId: amber.id,
      debtorId: meridian.id,
      faceValueMinor: terms.faceValueMinor,
      dueDate: terms.dueDate,
      status: "disbursed",
      advanceRateBps: terms.advanceRateBps,
      supplierRateBps: terms.supplierRateBps,
      funderRateBps: terms.funderRateBps,
      txnCostType: terms.txnCostType,
      txnCostValue: terms.txnCostValue,
      pricingSnapshot: snapshotToJson(snap),
    })
    .returning();
  await bookMovement(ldb, {
    invoiceId: inv.id,
    type: "funding",
    evidenceRef: `demo:seed:funding:${inv.id.slice(0, 8)}`,
    idempotencyKey: `funding:${inv.id}`,
    entries: [
      { accountId: acct("funder_cash", northgate.id), amountMinor: -snap.principalMinor },
      { accountId: acct("platform_treasury"), amountMinor: snap.principalMinor },
    ],
  });
  // The deliberate three-entry movement: fee lines visible, never margin.
  await bookMovement(ldb, {
    invoiceId: inv.id,
    type: "disbursement",
    evidenceRef: `demo:seed:disbursement:${inv.id.slice(0, 8)}`,
    idempotencyKey: `disbursement:${inv.id}`,
    entries: [
      { accountId: acct("platform_treasury"), amountMinor: -snap.principalMinor },
      { accountId: acct("supplier_payable", amber.id), amountMinor: snap.supplierDisbursementMinor },
      {
        accountId: acct("fee_income"),
        amountMinor: snap.principalMinor - snap.supplierDisbursementMinor,
      },
    ],
  });
}

console.log("Seeded:", {
  platform: platform.name,
  suppliers: [amber.name, ostrava.name],
  funder: northgate.name,
  debtors: [meridian.name, halvorsen.name, coralline.name],
  accounts: 5,
  invoices: "2 submitted · 1 approved · 1 refused · 1 funded · 1 disbursed",
  movements: "3 events, 7 entries, every event summing to zero — via lib/ledger",
});

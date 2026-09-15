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
  wallets,
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
await db.delete(wallets);
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
    { kind: "client_collections", partyId: null, currency: "USD" },
    { kind: "supplier_payable", partyId: amber.id, currency: "USD" },
    { kind: "supplier_payable", partyId: ostrava.id, currency: "USD" },
    { kind: "platform_operating", partyId: null, currency: "USD" },
    // cycle 1: where each debtor's repayment comes from
    { kind: "debtor_cash", partyId: meridian.id, currency: "USD" },
    { kind: "debtor_cash", partyId: halvorsen.id, currency: "USD" },
    { kind: "debtor_cash", partyId: coralline.id, currency: "USD" },
  ])
  .returning();
const acct = (kind: string, partyId: string | null = null) => {
  const a = chart.find((c) => c.kind === kind && c.partyId === partyId);
  if (!a) throw new Error(`seed: missing account ${kind}`);
  return a.id;
};

// Demo wallets (cycle 1): party ↔ address ↔ the NAME of the env var holding
// the key. Addresses are derived from .env.local at seed time; key material
// never reaches the database. Chain 84532 = Base Sepolia.
{
  const { demoWalletAddress } = await import("../src/lib/rails/wallets.ts");
  const BASE_SEPOLIA = 84532;
  const map = [
    { actor: "funder" as const, partyId: northgate.id, keyEnv: "WALLET_FUNDER_PK" },
    { actor: "platform" as const, partyId: null, keyEnv: "WALLET_PLATFORM_PK" },
    { actor: "supplier" as const, partyId: amber.id, keyEnv: "WALLET_SUPPLIER_PK" },
    { actor: "debtor" as const, partyId: meridian.id, keyEnv: "WALLET_DEBTOR_PK" },
  ];
  const rows = [];
  for (const m of map) {
    try {
      rows.push({
        partyId: m.partyId,
        address: demoWalletAddress(m.actor),
        keyEnv: m.keyEnv,
        chainId: BASE_SEPOLIA,
      });
    } catch {
      console.warn(`  (skipping ${m.actor} wallet — ${m.keyEnv} not set; see docs/demo-wallets-runbook.md)`);
    }
  }
  if (rows.length) await db.insert(wallets).values(rows);
}

// Backdrop invoices. Amounts are bigint minor units (cents).
const issued = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

await db.insert(invoices).values([
  {
    invoiceNumber: "AMB-2026-0041",
    issueDate: issued(12),
    description: "600 m organic cotton twill",
    supplierId: amber.id,
    debtorId: meridian.id,
    faceValueMinor: 54_000_00n,
    dueDate: isoDaysFromNow(30),
    status: "submitted",
  },
  {
    invoiceNumber: "OST-2026-0088",
    issueDate: issued(8),
    description: "Precision bearings, batch 44",
    supplierId: ostrava.id,
    debtorId: coralline.id,
    faceValueMinor: 12_400_00n,
    dueDate: isoDaysFromNow(45),
    status: "submitted",
  },
  {
    // Returned for correction — trade validation's third outcome, seeded so
    // the state is visible without staging it by hand.
    invoiceNumber: "AMB-2026-0044",
    issueDate: issued(3),
    description: "Bleached calico, 8 rolls",
    supplierId: amber.id,
    debtorId: coralline.id,
    faceValueMinor: 7_600_00n,
    dueDate: isoDaysFromNow(40),
    status: "returned",
    correctionNote:
      "The description does not match the purchase order — please confirm the goods and reissue.",
  },
  {
    invoiceNumber: "AMB-2026-0039",
    issueDate: issued(20),
    description: "Dyed linen, 3 pallets",
    supplierId: amber.id,
    debtorId: halvorsen.id,
    faceValueMinor: 18_200_00n,
    dueDate: isoDaysFromNow(60),
    // Priced, not merely approved: pricing is its own ops step, and this
    // backdrop deal carries a rate card so it is ready to fund.
    status: "priced",
    advanceRateBps: 8500,
    supplierRateBps: 950,
    funderRateBps: 800,
    txnCostType: "fixed",
    txnCostValue: 150_00n,
  },
  {
    invoiceNumber: "OST-2026-0090",
    issueDate: issued(5),
    description: "CNC housings, order 7712",
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
      invoiceNumber: "OST-2026-0075",
      issueDate: issued(30),
      description: "Hydraulic fittings, order 7690",
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
      { accountId: acct("client_collections"), amountMinor: snap.principalMinor },
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
      invoiceNumber: "AMB-2026-0031",
      issueDate: issued(55),
      description: "Cotton poplin, 12 rolls",
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
      { accountId: acct("client_collections"), amountMinor: snap.principalMinor },
    ],
  });
  // The deliberate three-entry movement: fee lines visible, never margin.
  await bookMovement(ldb, {
    invoiceId: inv.id,
    type: "disbursement",
    evidenceRef: `demo:seed:disbursement:${inv.id.slice(0, 8)}`,
    idempotencyKey: `disbursement:${inv.id}`,
    entries: [
      // cycle 2: the platform takes ONLY its margin; the funder's interest
      // stays in client money until payout.
      {
        accountId: acct("client_collections"),
        amountMinor: -(snap.supplierDisbursementMinor + snap.platformMarginMinor),
      },
      { accountId: acct("supplier_payable", amber.id), amountMinor: snap.supplierDisbursementMinor },
      { accountId: acct("platform_operating"), amountMinor: snap.platformMarginMinor },
    ],
  });
}

console.log("Seeded:", {
  platform: platform.name,
  suppliers: [amber.name, ostrava.name],
  funder: northgate.name,
  debtors: [meridian.name, halvorsen.name, coralline.name],
  accounts: 8,
  invoices: "2 submitted · 1 returned · 1 priced · 1 refused · 1 funded · 1 disbursed (all demo-internal rail)",
  movements: "3 events, 7 entries, every event summing to zero — via lib/ledger",
  wallets: "demo wallets mapped for Base Sepolia (addresses only; keys stay in .env.local)",
});

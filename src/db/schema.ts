import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  integer,
  date,
  jsonb,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// The five tables the foundation design's data contract names — approved by
// Chetan 2026-09-06 before this file was written. Money is ALWAYS bigint minor
// units. There is no balance column anywhere in this schema, on purpose: a
// balance is SUM(ledger_entries.amount_minor) for an account, derived at read.

export const partyRole = pgEnum("party_role", [
  "supplier",
  "funder",
  "platform",
  "debtor",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "submitted",
  "approved",
  "refused",
  "funded",
  "disbursed",
  // cycle 1: the deal's back half
  "repaid",
  "settled",
]);

// Which rail settles this deal's legs. Per-deal, chosen by ops at approval
// (PRD §3); existing deals default to the cycle-0 behaviour, so the two
// rails coexist — which is the seam's proof, not a transition state.
export const settlementRail = pgEnum("settlement_rail", ["demo-internal", "usdc"]);

export const accountKind = pgEnum("account_kind", [
  "funder_cash",
  "platform_treasury",
  "supplier_payable",
  "fee_income",
  // cycle 1: where the debtor's repayment comes from
  "debtor_cash",
]);

export const settlementEventType = pgEnum("settlement_event_type", [
  "funding",
  "disbursement",
  // cycle 1: the waterfall
  "repayment",
  "payout",
  "residual",
]);

// Cycle 0 books only demo-internal evidence; the other kinds are declared now
// so cycles 1–3 add rows, not columns.
export const evidenceKind = pgEnum("evidence_kind", [
  "demo-internal",
  "tx-hash",
  "circle-payment-id",
  "statement-line",
]);

export const txnCostType = pgEnum("txn_cost_type", ["fixed", "percent"]);

// Synthetic actors only — companies, never people. Domain data hangs off
// parties so a future accounts-mode cycle adds users BESIDE this, not into it.
export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  role: partyRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => parties.id),
  debtorId: uuid("debtor_id")
    .notNull()
    .references(() => parties.id),
  faceValueMinor: bigint("face_value_minor", { mode: "bigint" }).notNull(),
  currency: text("currency").notNull().default("USD"),
  dueDate: date("due_date").notNull(),
  status: invoiceStatus("status").notNull().default("submitted"),
  // Default keeps every pre-cycle-1 deal valid and unchanged.
  rail: settlementRail("rail").notNull().default("demo-internal"),
  refusalReason: text("refusal_reason"),
  // Terms, set by ops at approval. Rates in basis points; txn cost value is
  // minor units when type=fixed, basis points when type=percent.
  advanceRateBps: integer("advance_rate_bps"),
  supplierRateBps: integer("supplier_rate_bps"),
  funderRateBps: integer("funder_rate_bps"),
  txnCostType: txnCostType("txn_cost_type"),
  txnCostValue: bigint("txn_cost_value", { mode: "bigint" }),
  // Written exactly once, at funding. Every later amount reads this, never a
  // recomputation with a later "today".
  pricingSnapshot: jsonb("pricing_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: accountKind("kind").notNull(),
    // Null for platform-owned accounts (treasury, fee income).
    partyId: uuid("party_id").references(() => parties.id),
    currency: text("currency").notNull().default("USD"),
  },
  (t) => [
    // One account per (kind, party, currency); NULLS NOT DISTINCT so two
    // treasuries can't sneak in as "distinct" null-party rows.
    unique("accounts_kind_party_currency")
      .on(t.kind, t.partyId, t.currency)
      .nullsNotDistinct(),
  ],
);

export const settlementEvents = pgTable(
  "settlement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    type: settlementEventType("type").notNull(),
    evidenceKind: evidenceKind("evidence_kind").notNull().default("demo-internal"),
    evidenceRef: text("evidence_ref").notNull(),
    // The double-booking refusal lives HERE, in the database, not in the UI.
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // ONE TRANSACTION HASH NEVER SETTLES TWO LEGS. Partial: demo-internal
    // refs are per-leg strings and are not meant to be globally unique.
    uniqueIndex("settlement_events_tx_hash_once")
      .on(t.evidenceRef)
      .where(sql`${t.evidenceKind} = 'tx-hash'`),
  ],
);

// Demo wallet registry: which address acts for which party, and the NAME of
// the env var holding its key. KEY MATERIAL NEVER ENTERS THIS DATABASE —
// the name is a pointer, resolved server-side at request time.
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null = the platform's own wallet
    partyId: uuid("party_id").references(() => parties.id),
    address: text("address").notNull(),
    keyEnv: text("key_env").notNull(),
    chainId: integer("chain_id").notNull(),
  },
  (t) => [
    unique("wallets_party_chain").on(t.partyId, t.chainId).nullsNotDistinct(),
    unique("wallets_address_chain").on(t.address, t.chainId),
  ],
);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => settlementEvents.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  // Signed. Entries per event sum to zero — enforced by src/lib/ledger (the
  // sole writer) and asserted by test; Postgres cannot express it cheaply as
  // a row constraint, a limit stated rather than hidden.
  amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
});

import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
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
  // Returned for correction (Chetan 2026-09-09): trade validation's third
  // outcome, and the only two-way edge in the machine — the supplier fixes
  // the document and resubmits, and it is validated again from scratch.
  "returned",
  "approved",
  "refused",
  // Pricing is its own ops step (Chetan 2026-09-08): approval is the credit
  // decision, pricing sets the rate card. Cycle 7's limit check slots in
  // beside it. Funding requires `priced`, so an unpriced deal cannot fund.
  "priced",
  "funded",
  "disbursed",
  // cycle 1: the deal's back half
  "repaid",
  "settled",
]);

// Which rail settles this deal's legs. Per-deal for now, chosen by ops at
// pricing; existing deals default to the cycle-0 behaviour, so the rails
// coexist — which is the seam's proof, not a transition state.
//
// SCAFFOLDING, with a known end date (decided 2026-09-15, Chetan): from cycle
// 6 the PROGRAMME — the supplier × buyer RPA — carries the settlement
// arrangement, and this column becomes a snapshot of what the programme said,
// the way pricing_snapshot already is. Nothing before cycle 6 should deepen
// the per-deal model. See docs/product/CYCLES.md, "The programme".
export const settlementRail = pgEnum("settlement_rail", [
  "demo-internal",
  "usdc",
  // cycle 2: settles later, confirmed by signed webhook
  "circle-fiat",
]);

// CLIENT MONEY vs THE PLATFORM'S OWN — the standing segregation rule, which
// binds from cycle 2 onward (docs/product/CYCLES.md). The split is declared in
// src/lib/ledger so it can be asserted and displayed, not merely intended.
// ORDER IS NOT COSMETIC HERE. Migration 0005 renames one value in place and
// appends another, so Postgres ends up with exactly this sequence. Declaring a
// tidier grouping instead would make every future `drizzle-kit generate`
// produce a spurious diff. The client-money / platform-own split is therefore
// carried in the comments and enforced in src/lib/ledger, not by the order.
export const accountKind = pgEnum("account_kind", [
  "funder_cash", // client money
  // cycle 2: renamed IN PLACE from `platform_treasury`, which said the opposite
  // of what it holds. The audit found it was ALREADY a pure client-money
  // conduit — so this is honesty about naming, not a migration of balances.
  "client_collections", // client money
  "supplier_payable", // client money
  // RETIRED cycle 2, and it cannot be deleted: Postgres has no DROP VALUE for
  // enums. No new account uses it. It previously did double duty — the
  // platform's margin AND the funder's interest in transit — which is exactly
  // the commingling the split removes.
  "fee_income", // retired
  "debtor_cash", // client money — cycle 1: where the debtor's repayment comes from
  // cycle 2: holds ONLY the platform's margin (Chetan, 2026-09-15). The
  // funder's interest stays in client_collections until payout — it never
  // touches a platform account, because it was never the platform's.
  "platform_operating", // the platform's own
  // cycle 3: money that has ARRIVED but is not yet attributed to a deal. It is
  // CLIENT MONEY — somebody paid it and it is not the platform's — which is
  // why isClientMoney() must know about it. Appended rather than inserted:
  // Postgres orders enum values by creation, and the client-money split is
  // carried in comments and in src/lib/ledger, never by position.
  "unapplied", // client money
]);

/**
 * WHY OPS CHOSE THIS LEG — cycle 3, and a fixed set rather than free text.
 *
 * The escalation ladder is a policy (ask the payer, then the supplier, then
 * earliest maturity), and a fixed set is what makes "was it followed?"
 * answerable. Free text cannot be reported on and cannot prove the ladder was
 * walked. "Ops picked one" is exactly the audit answer this cycle exists to
 * prevent — the optional note beside this carries everything else.
 */
export const attributionReason = pgEnum("attribution_reason", [
  "payer-confirmed",
  "supplier-confirmed",
  "earliest-maturity",
  "other",
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
  // Document facts (added 2026-09-08). The number is the reference cycle 3
  // reconciles payments against and cycle 8 matches documents to; the issue
  // date drives invoice age and bounds the due date. Nullable so the six
  // pre-existing backdrop deals stay valid without invention.
  invoiceNumber: text("invoice_number"),
  issueDate: date("issue_date"),
  description: text("description"),
  status: invoiceStatus("status").notNull().default("submitted"),
  // Default keeps every pre-cycle-1 deal valid and unchanged.
  rail: settlementRail("rail").notNull().default("demo-internal"),
  refusalReason: text("refusal_reason"),
  // What ops asked the supplier to fix. Distinct from a refusal: this deal is
  // alive and waiting on the supplier, and the note is what they act on.
  correctionNote: text("correction_note"),
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
    // cycle 2: the same rule for Circle. The index above is partial on
    // 'tx-hash' and therefore never covered a payment id — and webhooks
    // deliver more than once, so this guard is load-bearing, not symmetry.
    uniqueIndex("settlement_events_circle_payment_once")
      .on(t.evidenceRef)
      .where(sql`${t.evidenceKind} = 'circle-payment-id'`),
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

// ─────────────────────────────────────────────────────────────────────────────
// CYCLE 2 — asynchronous settlement.
//
// The rails before this one answered `verify` inside the same request that
// called `execute`. Circle does not: it returns `pending` and tells the truth
// later, by webhook. Three tables carry the consequences.
// ─────────────────────────────────────────────────────────────────────────────

// `initiating` exists so that a crash BETWEEN writing the row and calling
// execute is distinguishable from one after it. Terminal: settled, failed.
export const pendingStatus = pgEnum("pending_status", [
  "initiating",
  "initiated",
  "settled",
  "failed",
]);

/**
 * THE IN-FLIGHT RECORD — and FIX 1's repair.
 *
 * Written BEFORE `execute`, never after. Until cycle 2 there was nowhere to
 * record that a movement had been attempted: if a transfer broadcast and
 * `verify` then threw, the money had moved and nothing in this system said so
 * (docs/product/settlement-usdc/deploy.md, D2). That hole is closed here, for
 * every rail, not only for Circle.
 *
 * Deliberately NOT a status column on settlement_events: an event's existence
 * means money moved, ledger_entries hangs off event_id, and balances are
 * SUM(ledger_entries). Keeping in-flight legs in their own table means
 * in-flight money cannot reach a balance BY CONSTRUCTION rather than by
 * remembering to filter.
 */
export const pendingSettlements = pgTable(
  "pending_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id),
    // Reuses the existing leg vocabulary — cycle 2 adds no leg types.
    type: settlementEventType("type").notNull(),
    rail: settlementRail("rail").notNull(),
    status: pendingStatus("status").notNull().default("initiating"),
    // Null until execute() returns; a Circle payment/payout id, or a tx hash.
    railReference: text("rail_reference"),
    amountMinor: bigint("amount_minor", { mode: "bigint" }).notNull(),
    // The SAME `${type}:${invoiceId}` key the ledger already uses, so the two
    // guards agree by construction rather than by coincidence.
    idempotencyKey: text("idempotency_key").notNull(),
    // THE ENTRIES OPS APPROVED, FROZEN (Chetan, 2026-09-15).
    //
    // On an immediate rail, "the server recomputes every figure at the
    // consequence" and the gate's preview cannot drift from what books. On a
    // deferred rail the consequence arrives hours later, and payout/residual
    // entries depend on overdue interest measured from `new Date()` — so
    // recomputing at webhook time could book numbers no human ever saw.
    // Freezing them keeps ConfirmDialog's contract true across the wait: what
    // was approved is what books. Amounts are strings because jsonb cannot
    // hold bigint — the same pattern pricing_snapshot already uses.
    entries: jsonb("entries").notNull(),
    failureReason: text("failure_reason"),
    initiatedAt: timestamp("initiated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    // ONE LEG IS NEVER IN FLIGHT TWICE. Partial, and the partiality is the
    // point: a FAILED attempt must not block a retry, and a retry creates a
    // NEW row so the history of attempts is never overwritten.
    uniqueIndex("pending_settlements_key_open")
      .on(t.idempotencyKey)
      .where(sql`status <> 'failed'`),
  ],
);

export const destinationKind = pgEnum("destination_kind", [
  "circle-wallet",
  "bank-account",
]);

/**
 * WHERE MONEY GOES on an off-chain rail. `wallets` cannot serve: every row
 * there is keyed by chain_id NOT NULL, in the column and in both unique
 * constraints, and a bank account has no chain id.
 *
 * NO CREDENTIAL EVER LANDS HERE — the same rule wallets.ts states for key
 * material. An external id is a pointer, not a secret; the Circle API key
 * stays in the environment and is read at request time.
 */
export const settlementDestinations = pgTable(
  "settlement_destinations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // null = the platform's own destination
    partyId: uuid("party_id").references(() => parties.id),
    rail: settlementRail("rail").notNull(),
    kind: destinationKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    label: text("label").notNull(),
    // Segregation, carried on the destination itself: a platform-funds payout
    // must never leave from a client-money account (CYCLES.md standing rule).
    isClientMoney: boolean("is_client_money").notNull().default(true),
  },
  (t) => [
    unique("settlement_destinations_party_rail")
      .on(t.partyId, t.rail)
      .nullsNotDistinct(),
  ],
);

/**
 * WHAT WE KNOW ABOUT A PAYMENT THAT THE RAIL CANNOT TELL US — cycle 3.
 *
 * Deliberately NOT a copy of the payment. Amount, arrival time and sender
 * always come from the rail: it is the record of what it holds, and a local
 * copy would be a second source of truth about money, which is precisely the
 * ambiguity this cycle exists to remove. There is no `status` column either —
 * attribution is DERIVED by summing movements booked against the payment's
 * reference, the same rule that keeps balances out of columns.
 *
 * So this table holds exactly three facts, and each one is a fact only a
 * person or this product can supply:
 *
 *   first_seen_at  WHEN WE NOTICED. The load-bearing one. The rail's
 *                  createDate is when the BANK moved the money; aging from it
 *                  and calling the result "how long this has been open" would
 *                  be measuring one thing while claiming another.
 *   owner          who is accountable for resolving it.
 *   note + reason  what a person decided, and on what basis.
 */
export const inboundPayments = pgTable(
  "inbound_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rail: settlementRail("rail").notNull(),
    /** The rail's own id. NOT a foreign key — the payment lives in Circle's
     *  database, not ours. */
    externalId: text("external_id").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** A hand-typed label until accounts mode (cycle 4a) gives this product
     *  real users. "Priya" is a good answer today; a foreign key to a user
     *  table that does not exist would not be. */
    owner: text("owner"),
    note: text("note"),
    resolutionReason: attributionReason("resolution_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("inbound_payments_rail_external").on(t.rail, t.externalId)],
);

export const webhookOutcome = pgEnum("webhook_outcome", [
  // signature missing or invalid — refused before the body meant anything
  "refused-signature",
  // well-formed and authentic, but no pending leg matches its reference.
  // The first real instance of cycle 3's unmatched-reference exception.
  "unmatched",
  "applied",
  // authentic and matched, but the leg was already resolved — a duplicate
  // delivery, which must be a no-op rather than a second booking
  "ignored",
]);

/**
 * EVERY DELIVERY, INCLUDING THE REFUSED ONES.
 *
 * So that duplicate and out-of-order delivery are PROVABLE rather than
 * asserted, and a forged delivery is recorded as refused rather than silently
 * dropped. The body is kept because a webhook is a claim, and claims are worth
 * keeping when the thing they claim is money.
 */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull().default("circle"),
  // The rail's own id for the event, when the body parses far enough to have one.
  externalId: text("external_id"),
  signatureValid: boolean("signature_valid").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rawBody: text("raw_body").notNull(),
  resolvedPendingId: uuid("resolved_pending_id").references(
    () => pendingSettlements.id,
  ),
  outcome: webhookOutcome("outcome").notNull(),
});

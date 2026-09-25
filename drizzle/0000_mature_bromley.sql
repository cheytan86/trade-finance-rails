CREATE TYPE "public"."account_kind" AS ENUM('funder_cash', 'platform_treasury', 'supplier_payable', 'fee_income');--> statement-breakpoint
CREATE TYPE "public"."evidence_kind" AS ENUM('demo-internal', 'tx-hash', 'circle-payment-id', 'statement-line');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('submitted', 'approved', 'refused', 'funded', 'disbursed');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('supplier', 'funder', 'platform', 'debtor');--> statement-breakpoint
CREATE TYPE "public"."settlement_event_type" AS ENUM('funding', 'disbursement');--> statement-breakpoint
CREATE TYPE "public"."txn_cost_type" AS ENUM('fixed', 'percent');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "account_kind" NOT NULL,
	"party_id" uuid,
	"currency" text DEFAULT 'USD' NOT NULL,
	CONSTRAINT "accounts_kind_party_currency" UNIQUE NULLS NOT DISTINCT("kind","party_id","currency")
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"debtor_id" uuid NOT NULL,
	"face_value_minor" bigint NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'submitted' NOT NULL,
	"refusal_reason" text,
	"advance_rate_bps" integer,
	"supplier_rate_bps" integer,
	"funder_rate_bps" integer,
	"txn_cost_type" "txn_cost_type",
	"txn_cost_value" bigint,
	"pricing_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "party_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "settlement_event_type" NOT NULL,
	"evidence_kind" "evidence_kind" DEFAULT 'demo-internal' NOT NULL,
	"evidence_ref" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_events_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_parties_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_debtor_id_parties_id_fk" FOREIGN KEY ("debtor_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_event_id_settlement_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."settlement_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_events" ADD CONSTRAINT "settlement_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
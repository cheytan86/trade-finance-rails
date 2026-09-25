CREATE TYPE "public"."destination_kind" AS ENUM('circle-wallet', 'bank-account');--> statement-breakpoint
CREATE TYPE "public"."pending_status" AS ENUM('initiating', 'initiated', 'settled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."webhook_outcome" AS ENUM('refused-signature', 'unmatched', 'applied', 'ignored');--> statement-breakpoint
ALTER TYPE "public"."settlement_rail" ADD VALUE 'circle-fiat';--> statement-breakpoint
CREATE TABLE "pending_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "settlement_event_type" NOT NULL,
	"rail" "settlement_rail" NOT NULL,
	"status" "pending_status" DEFAULT 'initiating' NOT NULL,
	"rail_reference" text,
	"amount_minor" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"failure_reason" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settlement_destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid,
	"rail" "settlement_rail" NOT NULL,
	"kind" "destination_kind" NOT NULL,
	"external_id" text NOT NULL,
	"label" text NOT NULL,
	"is_client_money" boolean DEFAULT true NOT NULL,
	CONSTRAINT "settlement_destinations_party_rail" UNIQUE NULLS NOT DISTINCT("party_id","rail")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'circle' NOT NULL,
	"external_id" text,
	"signature_valid" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_body" text NOT NULL,
	"resolved_pending_id" uuid,
	"outcome" "webhook_outcome" NOT NULL
);
--> statement-breakpoint
-- ── HAND-WRITTEN, replacing drizzle-kit's generated account_kind block ──────
-- drizzle-kit emitted: cast the column to text, DROP TYPE account_kind,
-- recreate it without 'platform_treasury', then cast the column back. That
-- final cast fails on every existing row whose kind is 'platform_treasury' —
-- the generator cannot know a rename is a rename, so it models it as a delete
-- plus an add. Replaced with a real rename, which preserves the data.
ALTER TYPE "public"."account_kind" RENAME VALUE 'platform_treasury' TO 'client_collections';--> statement-breakpoint
ALTER TYPE "public"."account_kind" ADD VALUE IF NOT EXISTS 'platform_operating';--> statement-breakpoint
-- 'fee_income' deliberately remains in the type: Postgres has no DROP VALUE
-- for enums. It is retired in code and no new account uses it.

ALTER TABLE "pending_settlements" ADD CONSTRAINT "pending_settlements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_destinations" ADD CONSTRAINT "settlement_destinations_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_resolved_pending_id_pending_settlements_id_fk" FOREIGN KEY ("resolved_pending_id") REFERENCES "public"."pending_settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pending_settlements_key_open" ON "pending_settlements" USING btree ("idempotency_key") WHERE status <> 'failed';--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_events_circle_payment_once" ON "settlement_events" USING btree ("evidence_ref") WHERE "settlement_events"."evidence_kind" = 'circle-payment-id';
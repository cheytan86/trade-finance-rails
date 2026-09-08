CREATE TYPE "public"."settlement_rail" AS ENUM('demo-internal', 'usdc');--> statement-breakpoint
ALTER TYPE "public"."account_kind" ADD VALUE 'debtor_cash';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'repaid';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'settled';--> statement-breakpoint
ALTER TYPE "public"."settlement_event_type" ADD VALUE 'repayment';--> statement-breakpoint
ALTER TYPE "public"."settlement_event_type" ADD VALUE 'payout';--> statement-breakpoint
ALTER TYPE "public"."settlement_event_type" ADD VALUE 'residual';--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid,
	"address" text NOT NULL,
	"key_env" text NOT NULL,
	"chain_id" integer NOT NULL,
	CONSTRAINT "wallets_party_chain" UNIQUE NULLS NOT DISTINCT("party_id","chain_id"),
	CONSTRAINT "wallets_address_chain" UNIQUE("address","chain_id")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "rail" "settlement_rail" DEFAULT 'demo-internal' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_events_tx_hash_once" ON "settlement_events" USING btree ("evidence_ref") WHERE "settlement_events"."evidence_kind" = 'tx-hash';
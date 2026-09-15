ALTER TYPE "public"."invoice_status" ADD VALUE 'returned' BEFORE 'approved';--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "correction_note" text;
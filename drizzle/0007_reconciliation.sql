-- Cycle 3 — reconciliation ops. Two changes, both additive.
--
-- 1. `unapplied` joins account_kind. The enum has held six values and none of
--    them can hold money that has ARRIVED but is not yet attributed. The
--    product paper names unapplied cash three times as an assumed capability;
--    `grep -i unapplied` across src/ and drizzle/ returned zero hits before
--    this migration. Part payments are impossible without it: the remainder
--    has nowhere to go.
--
-- 2. `inbound_payments` records ONLY what cannot be derived. Amount, arrival
--    time and sender always come from the rail and are never copied here —
--    the rail is the record of what it holds, and a local copy would be a
--    second source of truth about money. What the rail cannot know is when WE
--    first saw a payment, who owns the exception, and what a person decided.
--
--    first_seen_at is the load-bearing one. Aging is impossible without it:
--    the rail's createDate is when the BANK moved the money, not when this
--    product noticed, and measuring one while calling it the other is the
--    described-but-not-performed shape this project keeps catching.

ALTER TYPE "account_kind" ADD VALUE IF NOT EXISTS 'unapplied';--> statement-breakpoint

-- The fixed set from the design's C4, made real in the database rather than
-- enforced only in code. The escalation ladder is a policy, and a fixed set is
-- what makes "was it followed?" answerable — free text cannot be reported on
-- and cannot prove the ladder was walked.
CREATE TYPE "attribution_reason" AS ENUM (
  'payer-confirmed',
  'supplier-confirmed',
  'earliest-maturity',
  'other'
);--> statement-breakpoint

CREATE TABLE "inbound_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rail" "settlement_rail" NOT NULL,
  -- The rail's own id for this payment. NOT a foreign key to anything: the
  -- payment lives in Circle's database, not ours.
  "external_id" text NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- A hand-typed label until accounts mode (cycle 4a) gives this product real
  -- users. "Priya" is a perfectly good answer today; pretending it is a
  -- foreign key to a user table that does not exist would not be.
  "owner" text,
  "note" text,
  "resolution_reason" "attribution_reason",
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "inbound_payments_rail_external" UNIQUE("rail","external_id")
);

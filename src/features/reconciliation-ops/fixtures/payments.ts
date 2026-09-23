// SYNTHETIC INBOUND PAYMENTS — the world this feature reasons about.
//
// Every one of the five eval cases has its setup here, so a case can be built
// and argued about without a network call, a sandbox, or a seeded database.
// They are SHAPED FROM REAL DATA: the amounts, the collisions and the orphan
// are the ones a live reconciliation of the Circle sandbox actually produced on
// 2026-09-21 (13 deposits · 10 attributed · 3 unattributed · $50,105.00).
//
// Typed from the rail's own contract (import type only). Nothing here touches
// a database client, and nothing here is a database row: amount, arrival time
// and sender always come from the rail.

import type { InboundPayment } from "@/lib/rails/types";

/** Minor units from a decimal string, for readable fixtures. */
function usd(decimal: string): bigint {
  const [whole, frac = ""] = decimal.split(".");
  return BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0").slice(0, 2));
}

function at(iso: string): Date {
  return new Date(iso);
}

/** The one sender the sandbox can produce, because one bank account is
 *  registered. Held as a constant so the collision it causes is visible
 *  rather than accidental — see AMBIGUOUS_SENDER below. */
export const SANDBOX_SENDER = {
  id: "fbf1313c-8898-4fcb-b9d5-6932ff67395b",
  name: "WELLS FARGO BANK, NA ****0010",
} as const;

/** A second registered account, proved to produce a distinct sender id on
 *  2026-09-22. Kept so a fixture can show attribution working. */
export const SECOND_SENDER = {
  id: "b5ac0172-ad13-42ac-a007-fffd00131001",
  name: "WELLS FARGO BANK, NA ****0020",
} as const;

// ── case 1 · the positive path, on real ids ─────────────────────────────────

/**
 * $100 that arrived and was never booked. Its deal (`353a4c79`) is stuck at
 * `disbursed` waiting for exactly this amount — the pair cycle 2's defect 6
 * separated. Attributing this is the demo.
 */
export const UNATTRIBUTED_100: InboundPayment = {
  reference: "99bea655-fe27-4d1d-9b44-3308a673c31d",
  amountMinor: usd("100.00"),
  currency: "USD",
  arrivedAt: at("2026-09-18T07:46:29.295Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

/** Already attributed — same amount, an hour earlier. Present so the "is it
 *  spent?" question has a subject, and so case 5's double-spend refusal and
 *  case 3's ambiguity both have real material. */
export const SPENT_100: InboundPayment = {
  reference: "a0afd5d4-4e24-4e28-9f43-794d82f21fb0",
  amountMinor: usd("100.00"),
  currency: "USD",
  arrivedAt: at("2026-09-18T06:57:27.958Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

// ── case 2 · part payment ───────────────────────────────────────────────────

// The amounts here are deliberately NOWHERE NEAR 100.00. An earlier draft
// used 60 + 40 against a leg expecting 100, which quietly gave THREE open legs
// the same amount and turned case 3's two-way ambiguity into a three-way. The
// names carry no figures for the same reason — a renamed amount should not be
// able to leave a lying constant behind.

/** Less than the leg expects. The remainder must land in `unapplied`, and
 *  client_collections must still net to exactly zero. */
export const PART_PAYMENT_FIRST: InboundPayment = {
  reference: "c0ffee01-0000-4000-8000-000000000200",
  amountMinor: usd("200.00"),
  currency: "USD",
  arrivedAt: at("2026-09-19T09:00:00.000Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

/** The rest of it, later. Proves a leg may receive more than one movement —
 *  which the current idempotency key forbids (FIX A). */
export const PART_PAYMENT_SECOND: InboundPayment = {
  reference: "c0ffee02-0000-4000-8000-000000000120",
  amountMinor: usd("120.00"),
  currency: "USD",
  arrivedAt: at("2026-09-19T15:30:00.000Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

// ── case 4 · the orphan that must stay an orphan ────────────────────────────

/**
 * $50,000 matching no face value on the rail. It is NOT a defect and must not
 * be forced onto anything — the success metric is that it stays visible with
 * an age and an owner, which is why "unattributed value reaches zero" is
 * explicitly the wrong target.
 */
export const ORPHAN_50K: InboundPayment = {
  // NOTE: the first 8 characters are the real deposit's; the rest is padding.
  // UNATTRIBUTED_100 and SPENT_100 carry FULL real ids and can be looked up in
  // the sandbox. These two cannot — the prefix is for recognition, not for
  // querying, and assuming otherwise will return nothing.
  reference: "5ec3e2b9-0000-4000-8000-00005ec3e2b9",
  amountMinor: usd("50000.00"),
  currency: "USD",
  arrivedAt: at("2026-09-15T09:43:02.000Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

/** A second orphan, small and old. Two orphans of different ages are what
 *  makes an aging column mean anything. */
export const ORPHAN_5: InboundPayment = {
  reference: "46069659-0000-4000-8000-000046069659",
  amountMinor: usd("5.00"),
  currency: "USD",
  arrivedAt: at("2026-09-15T10:12:07.000Z"),
  sender: SANDBOX_SENDER,
  status: "complete",
};

// ── the edges a screen has to survive ───────────────────────────────────────

/** The rail has not made up its mind. Must be visible and must NOT be
 *  attributable — only `complete` may be booked. */
export const STILL_PENDING: InboundPayment = {
  reference: "c0ffee03-0000-4000-8000-000000000123",
  amountMinor: usd("123.45"),
  currency: "USD",
  arrivedAt: at("2026-09-22T08:00:00.000Z"),
  sender: SECOND_SENDER,
  status: "pending",
};

/** No sender at all — `source` is optional on Circle's record. Still fully
 *  attributable: the sender is context for a person, never a precondition. */
export const NO_SENDER: InboundPayment = {
  reference: "c0ffee04-0000-4000-8000-000000000077",
  amountMinor: usd("77.00"),
  currency: "USD",
  arrivedAt: at("2026-09-22T09:15:00.000Z"),
  status: "complete",
};

/** The rail says it will not happen. Never attributable, never counted. */
export const FAILED_PAYMENT: InboundPayment = {
  reference: "c0ffee05-0000-4000-8000-000000000999",
  amountMinor: usd("999.00"),
  currency: "USD",
  arrivedAt: at("2026-09-22T10:00:00.000Z"),
  sender: SANDBOX_SENDER,
  status: "failed",
};

/**
 * TWO PAYMENTS THAT CANNOT BE TOLD APART — same amount, same sender, minutes
 * apart. This is case 3's material and it is not hypothetical: the sandbox
 * holds two $100 deposits from the same registered account, and one of them is
 * how `99bea655` was orphaned.
 */
export const AMBIGUOUS_SENDER: readonly InboundPayment[] = [
  UNATTRIBUTED_100,
  SPENT_100,
];

/** Everything above, newest first — the order the queue renders in. */
export const ALL_PAYMENTS: readonly InboundPayment[] = [
  FAILED_PAYMENT,
  STILL_PENDING,
  NO_SENDER,
  PART_PAYMENT_SECOND,
  PART_PAYMENT_FIRST,
  UNATTRIBUTED_100,
  SPENT_100,
  ORPHAN_5,
  ORPHAN_50K,
].sort((a, b) => b.arrivedAt.getTime() - a.arrivedAt.getTime());

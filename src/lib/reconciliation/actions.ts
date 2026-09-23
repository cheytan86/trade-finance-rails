"use server";

// THE ATTRIBUTION — the one place this cycle books money.
//
// IT IS NOT A NEW WAY TO BOOK. It is a new way to DECIDE what books, and then
// it calls `bookMovement`, the same sole writer the gate and the webhook use.
// That distinction is the contract's most load-bearing line, and every guard
// below exists so this path cannot become a second door.
//
// NOTHING THE BROWSER SENDS IS TRUSTED. The form posts a payment reference, a
// leg id and an amount. The server re-reads the payment FROM THE RAIL, re-reads
// the leg from the database, recomputes what has already booked, and runs the
// same refusal set the screen ran. The browser posts a decision, never a
// result — the rule this product has held since cycle 0.
//
// THE REFUSALS RUN HERE, NOT ONLY IN THE UI. A disabled button stops the
// ordinary mistake. It does not stop a double submit, a stale tab, or two
// people working the queue at once — and this codebase already learned that
// when webhooks delivered twice (settlement_events_circle_payment_once exists
// BECAUSE the UI-level assumption failed).

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inboundPayments, pendingSettlements } from "@/db/schema";
import { getIdentity } from "@/lib/roles/identity";
import { bookMovement, LedgerError, type EntryInput } from "@/lib/ledger";
import {
  advanceFromBookedLegs,
  matchKeyFor,
  parseStoredEntries,
} from "@/lib/settlement/pending";
import { refuseAttribution, type BookedMovement } from "@/features/reconciliation-ops/attribution";
import { findPayment } from "./queue";
import { loadBookedOnLeg } from "./booked";
import type { RailId } from "@/lib/rails";

export interface AttributionResult {
  ok: boolean;
  /** A sentence for the person, rendered beside the control that caused it. */
  message: string;
  /** The named rule, so an eval can assert the REASON rather than the wording. */
  rule?: string;
}

/**
 * Scale a leg's FROZEN entries down to a partial amount.
 *
 * The entries were frozen when ops approved the gate (cycle 2, so that a
 * deferred rail cannot book numbers no human saw). A part payment moves less
 * than the whole, so each side scales by the same fraction.
 *
 * IT REFUSES RATHER THAN ROUNDS. Integer division can leave the sides unequal
 * by a penny, and a penny invented here is a penny the bank does not have. If
 * the scaled entries do not sum to exactly zero, this returns null and the
 * caller refuses with a reason — better a person handles it than the ledger
 * absorbs it.
 */
function scaleEntries(
  entries: EntryInput[],
  fromMinor: bigint,
  toMinor: bigint,
): EntryInput[] | null {
  if (fromMinor === toMinor) return entries;
  if (fromMinor <= 0n) return null;
  const scaled = entries.map((e) => ({
    accountId: e.accountId,
    amountMinor: (e.amountMinor * toMinor) / fromMinor,
  }));
  const sum = scaled.reduce((t, e) => t + e.amountMinor, 0n);
  if (sum !== 0n) return null;
  if (scaled.some((e) => e.amountMinor === 0n)) return null;
  return scaled;
}

export async function attributePayment(input: {
  reference: string;
  legId: string;
  amountMinor: string;
  reason?: string;
  note?: string;
}): Promise<AttributionResult> {
  // A public flag is never a permission, and it is not a route either.
  if (!process.env.NEXT_PUBLIC_ENABLE_RECONCILIATION) {
    return { ok: false, rule: "feature-disabled", message: "This feature is switched off." };
  }

  // Ops only, checked HERE — not merely on the page that rendered the button.
  const identity = await getIdentity();
  if (identity && identity.seat !== "ops") {
    return {
      ok: false,
      rule: "wrong-seat",
      message: "Only the ops seat can attribute a payment.",
    };
  }

  let amountMinor: bigint;
  try {
    amountMinor = BigInt(input.amountMinor);
  } catch {
    return { ok: false, rule: "bad-amount", message: "That amount is not a whole number of cents." };
  }

  const db = getDb();

  // THE RAIL IS RE-READ, every time. The form's copy of the payment could be
  // minutes old, and a payment's status can move.
  // The rail is discovered from the reference, not posted by the browser.
  const found = await findPayment(input.reference);
  if (!found) {
    return {
      ok: false,
      rule: "payment-not-found",
      message: "The rail no longer lists that payment. Reload the queue.",
    };
  }
  const { rail: RAIL, queued } = found;

  const [leg] = await db
    .select()
    .from(pendingSettlements)
    .where(eq(pendingSettlements.id, input.legId));
  if (!leg) {
    return { ok: false, rule: "leg-not-found", message: "That leg no longer exists." };
  }

  // What has already booked, recomputed rather than posted.
  const bookedAgainstPayment: BookedMovement[] =
    queued.attributedMinor > 0n ? [{ amountMinor: queued.attributedMinor }] : [];
  const bookedAgainstLeg = await loadBookedOnLeg(leg.invoiceId, leg.type);

  const refusal = refuseAttribution(
    {
      payment: queued.payment,
      bookedAgainstPayment,
      leg,
      bookedAgainstLeg,
      legCurrency: queued.payment.currency,
    },
    amountMinor,
  );
  if (refusal) return { ok: false, rule: refusal.rule, message: refusal.message };

  const frozen = parseStoredEntries(leg.entries);
  const entries = scaleEntries(frozen, leg.amountMinor, amountMinor);
  if (!entries) {
    return {
      ok: false,
      rule: "attribution-not-divisible",
      message:
        "This amount cannot be split across the leg's entries without inventing a penny. Attribute the full outstanding amount, or record this as an exception.",
    };
  }

  // THE SOLE WRITER. Keyed on the PAYMENT, so the same money cannot book twice
  // — not against this leg, and not against a different one either.
  try {
    await bookMovement(db, {
      invoiceId: leg.invoiceId,
      type: leg.type,
      evidenceKind: "circle-payment-id",
      evidenceRef: queued.payment.reference,
      idempotencyKey: matchKeyFor(queued.payment.reference),
      entries,
    });
  } catch (err) {
    if (err instanceof LedgerError && err.rule === "ledger-already-recorded") {
      // The database's own guard, reached by a race the screen could not see.
      return {
        ok: false,
        rule: "attribution-payment-spent",
        message:
          "This payment has already been attributed — someone else may have just done it. Reload the queue.",
      };
    }
    throw err;
  }

  // C3 — a leg being resolved by hand must not stay in flight forever. Only
  // once it is actually covered: a part payment leaves it open, correctly.
  const coveredNow =
    bookedAgainstLeg.reduce((t, m) => t + m.amountMinor, 0n) + amountMinor >= leg.amountMinor;
  if (coveredNow && leg.status !== "settled") {
    await db
      .update(pendingSettlements)
      .set({ status: "settled", resolvedAt: new Date(), railReference: queued.payment.reference })
      .where(
        and(eq(pendingSettlements.id, leg.id), eq(pendingSettlements.status, leg.status)),
      );
  }

  // The deal's status stays DERIVED from its booked legs — this feature adds
  // no new way to move an invoice.
  await advanceFromBookedLegs(db, leg.invoiceId);

  await recordDecision(RAIL, input.reference, input.reason, input.note, identity?.seat ?? null);

  for (const path of [
    "/ops",
    "/ops/payments",
    `/ops/payments/${queued.payment.reference}`,
    `/ops/deals/${leg.invoiceId}`,
    "/ops/ledger",
    "/supplier",
    "/funder",
  ]) {
    revalidatePath(path);
  }

  return {
    ok: true,
    message: `Attributed to the ${leg.type} on ${leg.invoiceId.slice(0, 8)}.`,
  };
}

/**
 * What ops decided, and why. Written to `inbound_payments` — the table that
 * holds ONLY what cannot be derived.
 *
 * Recording must never be the reason a legitimate attribution fails: the money
 * is already booked by the time this runs, and a lost note is a worse outcome
 * than no note only if it takes the booking with it.
 */
async function recordDecision(
  rail: RailId,
  reference: string,
  reason: string | undefined,
  note: string | undefined,
  seat: string | null,
): Promise<void> {
  try {
    const db = getDb();
    const allowed = ["payer-confirmed", "supplier-confirmed", "earliest-maturity", "other"];
    const value = reason && allowed.includes(reason) ? reason : null;
    await db
      .insert(inboundPayments)
      .values({
        rail: rail as RailId,
        externalId: reference,
        owner: seat,
        note: note?.slice(0, 2_000) || null,
        resolutionReason: value as never,
      })
      .onConflictDoUpdate({
        target: [inboundPayments.rail, inboundPayments.externalId],
        set: {
          owner: seat,
          note: note?.slice(0, 2_000) || null,
          resolutionReason: value as never,
          updatedAt: new Date(),
        },
      });
  } catch {
    /* evidence, not a control */
  }
}

"use server";

// Every consequence in the cycle-0 spine. The rules that hold in all of them:
//
//   · The browser posts a DECISION — an invoice id and an action. Never an
//     amount, never a result. Every figure below is recomputed from the
//     server's own rows at the moment of the consequence.
//   · Money moves only through src/lib/ledger, the sole writer, which refuses
//     anything that does not sum to zero before the database is touched.
//   · State moves only through assertTransition, which names the failing rule.
//   · Every failure returns a sentence a person can read. No 500s as UX.

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { invoices, accounts, parties, settlementEvents } from "@/db/schema";
import { assertTransition } from "@/lib/domain/states";
import { computePricing, snapshotToJson, parseSnapshot } from "@/lib/pricing";
import { bookMovement } from "@/lib/ledger";
import { parseDecimalToMinor, MoneyError } from "@/lib/money";
import {
  fundingEntries,
  disbursementEntries,
  repaymentEntries,
  payoutEntries,
  residualEntries,
} from "./preview";
import { getIdentity } from "@/lib/roles/identity";
import { resolvePartyForSeat } from "@/lib/queries";
import { railFor, type RailActor, type RailId } from "@/lib/rails";
import { computeOverdue, daysLateBetween } from "@/lib/pricing/overdue";

/**
 * Move money through the deal's rail, then book it — in that order, always.
 * The rail sends, the rail's own source of truth is consulted, and only a
 * VERIFIED transfer becomes ledger entries. A rail failure books nothing.
 */
async function settleThroughRail(
  db: Db,
  opts: {
    railId: RailId;
    invoiceId: string;
    type: "funding" | "disbursement" | "repayment" | "payout" | "residual";
    from: RailActor;
    to: RailActor;
    amountMinor: bigint;
    entries: Array<{ accountId: string; amountMinor: bigint }>;
  },
) {
  const rail = railFor(opts.railId);
  const idempotencyKey = `${opts.type}:${opts.invoiceId}`;
  const req = {
    idempotencyKey,
    from: opts.from,
    to: opts.to,
    amountMinor: opts.amountMinor,
  };

  const receipt = await rail.execute(req);
  const verified = await rail.verify(req, receipt);

  await bookMovement(db, {
    invoiceId: opts.invoiceId,
    type: opts.type,
    evidenceKind: verified.evidenceKind,
    evidenceRef: verified.reference,
    idempotencyKey,
    entries: opts.entries,
  });
}

export interface ActionResult {
  error?: string;
}

/**
 * Our domain errors all carry a named `rule` — those become readable
 * sentences for the operator. Anything else is a genuine fault and rethrows
 * rather than being disguised as a business refusal.
 */
function asMessage(err: unknown): string {
  if (err instanceof Error && typeof (err as { rule?: unknown }).rule === "string") {
    return err.message;
  }
  throw err;
}

async function accountId(
  db: Db,
  kind: (typeof accounts.$inferSelect)["kind"],
  partyId: string | null,
): Promise<{ id: string; label: string }> {
  const [row] = await db
    .select({ id: accounts.id, kind: accounts.kind, partyName: parties.name })
    .from(accounts)
    .leftJoin(parties, eq(accounts.partyId, parties.id))
    .where(
      and(
        eq(accounts.kind, kind),
        partyId === null ? isNull(accounts.partyId) : eq(accounts.partyId, partyId),
      ),
    );
  if (!row) throw new MoneyError("missing-account", `no ${kind} account exists for this party`);
  return { id: row.id, label: row.partyName ? `${row.kind} · ${row.partyName}` : row.kind };
}

// ── the supplier's trigger ──────────────────────────────────────────────────

interface InvoiceFields {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  description: string;
  debtorId: string;
  faceValueMinor: bigint;
}

/**
 * ONE rule set for an invoice's document facts, used by both submission and
 * resubmission-after-correction — a corrected invoice is checked exactly as
 * strictly as a fresh one, which is the point of returning it.
 */
async function readInvoiceFields(
  db: Db,
  formData: FormData,
): Promise<{ fields: InvoiceFields } | { error: string }> {
  const dueDate = String(formData.get("dueDate") ?? "");
  const issueDate = String(formData.get("issueDate") ?? "");
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const debtorId = String(formData.get("debtorId") ?? "");

  const faceValueMinor = parseDecimalToMinor(
    String(formData.get("faceValue") ?? ""),
    2,
    "Face value",
  );
  if (faceValueMinor <= 0n) return { error: "Face value must be greater than zero." };

  // The number is the reference cycle 3 reconciles payments against, so it
  // must exist; cycle 8 matches shipping documents to it.
  if (invoiceNumber.length < 2) {
    return { error: "Give the invoice a number — it is the reference payments are matched to." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return { error: "Issue date must be a calendar date (YYYY-MM-DD)." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    return { error: "Due date must be a calendar date (YYYY-MM-DD)." };
  }
  if (issueDate >= dueDate) {
    return { error: "The issue date must fall before the due date." };
  }
  if (description.length < 3) {
    return { error: "Describe what was supplied — one line is enough." };
  }
  // A receivable already past its due date is a collections problem, not a
  // financing one — and it would price at zero tenor, which is nonsense.
  const today = new Date().toISOString().slice(0, 10);
  if (dueDate <= today) {
    return {
      error: "Due date must be in the future — a past-due invoice cannot be financed here.",
    };
  }

  const [debtor] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(and(eq(parties.id, debtorId), eq(parties.role, "debtor")));
  if (!debtor) return { error: "Choose a debtor from the list." };

  return {
    fields: { invoiceNumber, issueDate, dueDate, description, debtorId: debtor.id, faceValueMinor },
  };
}

export async function submitInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await getIdentity();
  if (!identity || identity.seat !== "supplier") {
    return { error: "Only the supplier seat can submit an invoice." };
  }
  const db = getDb();

  try {
    const read = await readInvoiceFields(db, formData);
    if ("error" in read) return read;
    const f = read.fields;

    // The seat cookie is a claim. resolvePartyForSeat honours it only if it
    // names a real supplier — and it is the same resolution the /supplier page
    // renders with, so the screen and the write can never disagree about who
    // is acting.
    const supplier = await resolvePartyForSeat("supplier", identity.partyId);
    if (!supplier) return { error: "No supplier exists in the demo data." };

    const [dupe] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(eq(invoices.supplierId, supplier.id), eq(invoices.invoiceNumber, f.invoiceNumber)),
      );
    if (dupe) {
      return { error: `You have already submitted invoice ${f.invoiceNumber}.` };
    }

    await db.insert(invoices).values({
      invoiceNumber: f.invoiceNumber,
      issueDate: f.issueDate,
      description: f.description,
      supplierId: supplier.id,
      debtorId: f.debtorId,
      faceValueMinor: f.faceValueMinor,
      dueDate: f.dueDate,
      status: "submitted",
    });
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidatePath("/supplier");
  revalidatePath("/ops");
  return {};
}

/**
 * RESUBMIT — the supplier's answer to a return. Everything on the invoice is
 * editable (Chetan 2026-09-09), because any field can be the thing that was
 * wrong; the deal re-enters validation as a fresh submission and the
 * correction note is cleared with it.
 */
export async function resubmitInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await getIdentity();
  if (!identity || identity.seat !== "supplier") {
    return { error: "Only the supplier seat can resubmit an invoice." };
  }
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "submitted");

    const supplier = await resolvePartyForSeat("supplier", identity.partyId);
    if (!supplier || supplier.id !== inv.supplierId) {
      return { error: "This invoice belongs to another supplier." };
    }

    const read = await readInvoiceFields(db, formData);
    if ("error" in read) return read;
    const f = read.fields;

    // The number may have changed — it must still be unique for this supplier.
    const [dupe] = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(eq(invoices.supplierId, supplier.id), eq(invoices.invoiceNumber, f.invoiceNumber)),
      );
    if (dupe && dupe.id !== id) {
      return { error: `You already have an invoice numbered ${f.invoiceNumber}.` };
    }

    const updated = await db
      .update(invoices)
      .set({
        invoiceNumber: f.invoiceNumber,
        issueDate: f.issueDate,
        description: f.description,
        debtorId: f.debtorId,
        faceValueMinor: f.faceValueMinor,
        dueDate: f.dueDate,
        status: "submitted",
        correctionNote: null,
      })
      .where(and(eq(invoices.id, id), eq(invoices.status, "returned")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "This invoice is no longer awaiting correction — reload and look again." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidatePath("/supplier");
  revalidatePath("/ops");
  revalidateDeal(id);
  return {};
}

// ── ops: approve with terms, or refuse with a reason ────────────────────────

/**
 * APPROVE — the credit/eligibility decision, and nothing else. No rates: the
 * price is set in its own step (Chetan 2026-09-08), which is also the slot
 * cycle 7's limit check drops into.
 */
export async function approveInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    // Approving an already-approved deal is what the operator wanted anyway —
    // a double-clicked button should not produce an error. Anything else is
    // checked by the machine.
    if (inv.status === "approved") return {};
    assertTransition(inv.status, "approved");

    const updated = await db
      .update(invoices)
      .set({ status: "approved", refusalReason: null })
      .where(and(eq(invoices.id, id), eq(invoices.status, "submitted")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "The deal moved while you were deciding — reload and look again." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

/**
 * PRICE — the rate card and the rail, its own step after approval. Re-pricing
 * an already-priced deal is allowed and updates in place: terms stay editable
 * until funding locks the snapshot (design §3).
 */
export async function priceInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    // Re-pricing is not a transition; anything else is checked by the machine.
    if (inv.status !== "priced") assertTransition(inv.status, "priced");

    const bps = (name: string, label: string): number => {
      const raw = String(formData.get(name) ?? "").trim();
      if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
        throw new MoneyError("terms-rate", `${label} must be a percentage like 8.50.`);
      }
      return Math.round(Number(raw) * 100);
    };
    const advanceRateBps = bps("advanceRate", "Advance rate");
    if (advanceRateBps <= 0 || advanceRateBps > 10_000) {
      return { error: "Advance rate must be between 0% and 100%." };
    }
    const supplierRateBps = bps("supplierRate", "Supplier rate");
    const funderRateBps = bps("funderRate", "Funder rate");
    for (const [label, value] of [
      ["Supplier rate", supplierRateBps],
      ["Funder rate", funderRateBps],
    ] as const) {
      if (value < 0 || value > 10_000) {
        return { error: `${label} must be between 0% and 100% per annum.` };
      }
    }
    const txnCostType = String(formData.get("txnCostType")) === "percent" ? "percent" : "fixed";
    const txnCostValue =
      txnCostType === "fixed"
        ? parseDecimalToMinor(String(formData.get("txnCostValue") ?? "0"), 2, "Transaction cost")
        : BigInt(bps("txnCostValue", "Transaction cost"));
    if (txnCostValue < 0n) return { error: "Transaction cost cannot be negative." };

    const railChoice = String(formData.get("rail") ?? "demo-internal");
    const rail: RailId = railChoice === "usdc" ? "usdc" : "demo-internal";

    // Price the deal as proposed and refuse terms that would book a loss:
    // margin = supplier interest + fee − funder interest, and a platform that
    // pays for the privilege of intermediating is a pricing error, not a deal.
    const proposed = computePricing(
      {
        faceValueMinor: inv.faceValueMinor,
        dueDate: inv.dueDate,
        advanceRateBps,
        supplierRateBps,
        funderRateBps,
        txnCostType,
        txnCostValue,
      },
      new Date(),
    );
    if (proposed.platformMarginMinor < 0n) {
      return {
        error:
          "These terms price at a negative margin — the funder's return would exceed what the supplier pays. Raise the supplier rate or lower the funder rate.",
      };
    }

    // Compare-and-swap: the WHERE repeats the status precondition, so a race
    // cannot price a deal that has moved on.
    const updated = await db
      .update(invoices)
      .set({
        status: "priced",
        advanceRateBps,
        supplierRateBps,
        funderRateBps,
        txnCostType,
        txnCostValue,
        rail,
      })
      .where(and(eq(invoices.id, id), inArray(invoices.status, ["approved", "priced"])))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "The deal moved while you were pricing — reload and look again." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

/**
 * RETURN FOR CORRECTION — trade validation's third outcome, and the one real
 * trade ops use most. The deal goes back to the supplier alive, with a note
 * saying what to fix; it re-enters validation when they resubmit. Available
 * ONLY before approval (Chetan 2026-09-09).
 */
export async function returnForCorrection(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 4) {
    return {
      error: "Say what needs correcting — the supplier acts on this note, so it cannot be blank.",
    };
  }
  const db = getDb();
  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "returned");
    const updated = await db
      .update(invoices)
      .set({ status: "returned", correctionNote: note })
      .where(and(eq(invoices.id, id), eq(invoices.status, "submitted")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "The deal moved while you were deciding — reload and look again." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  revalidatePath("/supplier");
  return {};
}

export async function refuseInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 4) {
    return { error: "A refusal must name its reason — that is the whole point of refusing." };
  }
  const db = getDb();
  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "refused");
    const updated = await db
      .update(invoices)
      .set({ status: "refused", refusalReason: reason })
      .where(and(eq(invoices.id, id), eq(invoices.status, "submitted")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "The deal moved while you were deciding — reload and look again." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

// ── the two money gates ─────────────────────────────────────────────────────

export async function fundInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "funded");
    if (
      inv.advanceRateBps == null ||
      inv.supplierRateBps == null ||
      inv.funderRateBps == null ||
      inv.txnCostType == null ||
      inv.txnCostValue == null
    ) {
      return { error: "Terms are not set — an invoice cannot be funded before it is priced." };
    }

    // The snapshot locks HERE, at the consequence, from the server's rows.
    const snapshot = computePricing(
      {
        faceValueMinor: inv.faceValueMinor,
        dueDate: inv.dueDate,
        advanceRateBps: inv.advanceRateBps,
        supplierRateBps: inv.supplierRateBps,
        funderRateBps: inv.funderRateBps,
        txnCostType: inv.txnCostType,
        txnCostValue: inv.txnCostValue,
      },
      new Date(),
    );

    // Ordered, not row-order luck: the gate dialog picks the funder the same
    // way (queries.accountRefsFor), so what is shown is what gets booked.
    const [funder] = await db
      .select()
      .from(parties)
      .where(eq(parties.role, "funder"))
      .orderBy(asc(parties.name))
      .limit(1);
    if (!funder) return { error: "No funder exists in the demo data." };

    const entries = fundingEntries(snapshot, {
      funderCash: await accountId(db, "funder_cash", funder.id),
      clientCollections: await accountId(db, "client_collections", null),
    });

    await settleThroughRail(db, {
      railId: inv.rail,
      invoiceId: id,
      type: "funding",
      from: "funder",
      to: "platform",
      amountMinor: snapshot.principalMinor,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });

    // CAS. Unreachable-in-practice failure (the idempotency key already
    // guards the booking), but an unguarded write is a habit, not a hole we
    // leave open.
    const updated = await db
      .update(invoices)
      .set({ status: "funded", pricingSnapshot: snapshotToJson(snapshot) })
      .where(and(eq(invoices.id, id), eq(invoices.status, "priced")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "Funding booked but the deal moved concurrently — check the ledger view." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

export async function disburseInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "disbursed");
    if (!inv.pricingSnapshot) {
      return { error: "No pricing snapshot on this deal — it was never funded." };
    }
    // Read the LOCKED numbers; never recompute with a later "today".
    const snapshot = parseSnapshot(inv.pricingSnapshot);

    const entries = disbursementEntries(snapshot, {
      clientCollections: await accountId(db, "client_collections", null),
      supplierPayable: await accountId(db, "supplier_payable", inv.supplierId),
      platformOperating: await accountId(db, "platform_operating", null),
    });

    await settleThroughRail(db, {
      railId: inv.rail,
      invoiceId: id,
      type: "disbursement",
      from: "platform",
      to: "supplier",
      // The wire moves what the supplier actually receives; the fee lines
      // stay behind in the ledger, which is why they are lines.
      amountMinor: snapshot.supplierDisbursementMinor,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });

    const updated = await db
      .update(invoices)
      .set({ status: "disbursed" })
      .where(and(eq(invoices.id, id), eq(invoices.status, "funded")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "Disbursement booked but the deal moved concurrently — check the ledger view." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

// ── the back half ───────────────────────────────────────────────────────────

/**
 * Repayment. PUBLIC by design — an invoice payment link needs no seat, and
 * the confirm dialog is its gate. The debtor pays exactly the face value,
 * whether early or late: the overdue charge is borne by the supplier's
 * residual (Chetan 2026-09-07), so this number never moves.
 */
export async function repayInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();
  try {
    const inv = await loadInvoice(db, id);
    assertTransition(inv.status, "repaid");

    const entries = repaymentEntries(inv.faceValueMinor, {
      debtorCash: await accountId(db, "debtor_cash", inv.debtorId),
      clientCollections: await accountId(db, "client_collections", null),
    });

    await settleThroughRail(db, {
      railId: inv.rail,
      invoiceId: id,
      type: "repayment",
      from: "debtor",
      to: "platform",
      amountMinor: inv.faceValueMinor,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });

    const updated = await db
      .update(invoices)
      .set({ status: "repaid" })
      .where(and(eq(invoices.id, id), eq(invoices.status, "disbursed")))
      .returning({ id: invoices.id });
    if (updated.length === 0) {
      return { error: "Payment booked but the deal moved concurrently — check the ledger view." };
    }
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  revalidatePath(`/pay/${id}`);
  return {};
}

/**
 * Overdue is computed once, from the locked snapshot and the REPAYMENT
 * EVENT's timestamp — the event log is the single source of when money
 * arrived, so no invoice column duplicates it (design §4). Both payout and
 * residual therefore read identical numbers.
 */
async function overdueFor(db: Db, inv: typeof invoices.$inferSelect) {
  const snapshot = parseSnapshot(inv.pricingSnapshot);
  const [repayment] = await db
    .select({ at: settlementEvents.createdAt })
    .from(settlementEvents)
    .where(and(eq(settlementEvents.invoiceId, inv.id), eq(settlementEvents.type, "repayment")))
    .limit(1);
  const repaidAt = repayment?.at ?? new Date();
  return {
    snapshot,
    overdue: computeOverdue({
      principalMinor: snapshot.principalMinor,
      supplierRateBps: inv.supplierRateBps ?? 0,
      funderRateBps: inv.funderRateBps ?? 0,
      daysLate: daysLateBetween(inv.dueDate, repaidAt),
      residualMinor: snapshot.supplierResidualMinor,
    }),
  };
}

/** Both back-half legs booked → the deal is settled. Order-independent. */
async function maybeSettle(db: Db, invoiceId: string) {
  const events = await db
    .select({ type: settlementEvents.type })
    .from(settlementEvents)
    .where(eq(settlementEvents.invoiceId, invoiceId));
  const kinds = new Set(events.map((e) => e.type));
  if (kinds.has("payout") && kinds.has("residual")) {
    await db
      .update(invoices)
      .set({ status: "settled" })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "repaid")));
  }
}

export async function payoutFunder(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();
  try {
    const inv = await loadInvoice(db, id);
    if (inv.status !== "repaid") {
      return { error: `The funder is paid out after repayment; this deal is ${inv.status}.` };
    }
    if (!inv.pricingSnapshot) return { error: "No pricing snapshot on this deal." };
    const { snapshot, overdue } = await overdueFor(db, inv);

    const [funder] = await db
      .select()
      .from(parties)
      .where(eq(parties.role, "funder"))
      .orderBy(asc(parties.name))
      .limit(1);
    if (!funder) return { error: "No funder exists in the demo data." };

    // Two accounts, not three: under the cycle-2 split the funder's interest
    // never left client money, so there is no platform account to draw it
    // back out of.
    const entries = payoutEntries(snapshot, overdue, {
      clientCollections: await accountId(db, "client_collections", null),
      funderCash: await accountId(db, "funder_cash", funder.id),
    });

    await settleThroughRail(db, {
      railId: inv.rail,
      invoiceId: id,
      type: "payout",
      from: "platform",
      to: "funder",
      amountMinor:
        snapshot.principalMinor + snapshot.funderInterestMinor + overdue.funderShareMinor,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });
    await maybeSettle(db, id);
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

export async function payResidual(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();
  try {
    const inv = await loadInvoice(db, id);
    if (inv.status !== "repaid") {
      return { error: `The residual is paid after repayment; this deal is ${inv.status}.` };
    }
    if (!inv.pricingSnapshot) return { error: "No pricing snapshot on this deal." };
    const { snapshot, overdue } = await overdueFor(db, inv);

    const entries = residualEntries(snapshot, overdue, {
      clientCollections: await accountId(db, "client_collections", null),
      supplierPayable: await accountId(db, "supplier_payable", inv.supplierId),
      platformOperating: await accountId(db, "platform_operating", null),
    });

    const toSupplier = snapshot.supplierResidualMinor - overdue.supplierChargeMinor;
    await settleThroughRail(db, {
      railId: inv.rail,
      invoiceId: id,
      type: "residual",
      from: "platform",
      to: "supplier",
      amountMinor: toSupplier,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });
    await maybeSettle(db, id);
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidateDeal(id);
  return {};
}

// ── shared ──────────────────────────────────────────────────────────────────

async function requireOps(): Promise<ActionResult | null> {
  const identity = await getIdentity();
  if (!identity || identity.seat !== "ops") {
    return { error: "Only platform ops can move a deal — switch seats to act." };
  }
  return null;
}

async function loadInvoice(db: Db, id: string) {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) throw new MoneyError("missing-invoice", "That invoice no longer exists.");
  return inv;
}

function revalidateDeal(id: string) {
  revalidatePath(`/ops/deals/${id}`);
  revalidatePath("/ops");
  revalidatePath("/ops/ledger");
  revalidatePath("/supplier");
  revalidatePath("/funder");
}

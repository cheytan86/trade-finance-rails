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
import { invoices, accounts, parties } from "@/db/schema";
import { assertTransition } from "@/lib/domain/states";
import { computePricing, snapshotToJson, parseSnapshot } from "@/lib/pricing";
import { bookMovement } from "@/lib/ledger";
import { parseDecimalToMinor, MoneyError } from "@/lib/money";
import { fundingEntries, disbursementEntries } from "./preview";
import { getIdentity } from "@/lib/roles/identity";
import { resolvePartyForSeat } from "@/lib/queries";

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
  kind: "funder_cash" | "platform_treasury" | "supplier_payable" | "fee_income",
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

export async function submitInvoice(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const identity = await getIdentity();
  if (!identity || identity.seat !== "supplier") {
    return { error: "Only the supplier seat can submit an invoice." };
  }
  const db = getDb();
  const debtorId = String(formData.get("debtorId") ?? "");
  const dueDate = String(formData.get("dueDate") ?? "");

  try {
    const faceValueMinor = parseDecimalToMinor(
      String(formData.get("faceValue") ?? ""),
      2,
      "Face value",
    );
    if (faceValueMinor <= 0n) return { error: "Face value must be greater than zero." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      return { error: "Due date must be a calendar date (YYYY-MM-DD)." };
    }
    // A receivable already past its due date is a collections problem, not a
    // financing one — and it would price at zero tenor, which is nonsense.
    const today = new Date().toISOString().slice(0, 10);
    if (dueDate <= today) {
      return { error: "Due date must be in the future — a past-due invoice cannot be financed here." };
    }

    // The seat cookie is a claim. resolvePartyForSeat honours it only if it
    // names a real supplier — and it is the same resolution the /supplier page
    // renders with, so the screen and the write can never disagree about who
    // is acting.
    const supplier = await resolvePartyForSeat("supplier", identity.partyId);
    if (!supplier) return { error: "No supplier exists in the demo data." };

    const [debtor] = await db
      .select({ id: parties.id })
      .from(parties)
      .where(and(eq(parties.id, debtorId), eq(parties.role, "debtor")));
    if (!debtor) return { error: "Choose a debtor from the list." };

    await db.insert(invoices).values({
      supplierId: supplier.id,
      debtorId: debtor.id,
      faceValueMinor,
      dueDate,
      status: "submitted",
    });
  } catch (err) {
    return { error: asMessage(err) };
  }
  revalidatePath("/supplier");
  revalidatePath("/ops");
  return {};
}

// ── ops: approve with terms, or refuse with a reason ────────────────────────

export async function approveWithTerms(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireOps();
  if (gate) return gate;
  const id = String(formData.get("invoiceId") ?? "");
  const db = getDb();

  try {
    const inv = await loadInvoice(db, id);
    // Design §3: terms are editable until funding. Setting terms on an
    // approved deal is a re-approval, not a transition; anything later is
    // refused by the state machine with its rule named.
    if (inv.status !== "approved") assertTransition(inv.status, "approved");

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
    // (a refusal landing between our read and this write) updates zero rows
    // instead of resurrecting a dead deal.
    const updated = await db
      .update(invoices)
      .set({
        status: "approved",
        advanceRateBps,
        supplierRateBps,
        funderRateBps,
        txnCostType,
        txnCostValue,
        refusalReason: null,
      })
      .where(and(eq(invoices.id, id), inArray(invoices.status, ["submitted", "approved"])))
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
      treasury: await accountId(db, "platform_treasury", null),
    });

    await bookMovement(db, {
      invoiceId: id,
      type: "funding",
      evidenceRef: `demo:funding:${id.slice(0, 8)}`,
      idempotencyKey: `funding:${id}`,
      entries: entries.map((e) => ({ accountId: e.accountId, amountMinor: e.amountMinor })),
    });

    // CAS. Unreachable-in-practice failure (the idempotency key already
    // guards the booking), but an unguarded write is a habit, not a hole we
    // leave open.
    const updated = await db
      .update(invoices)
      .set({ status: "funded", pricingSnapshot: snapshotToJson(snapshot) })
      .where(and(eq(invoices.id, id), eq(invoices.status, "approved")))
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
      treasury: await accountId(db, "platform_treasury", null),
      supplierPayable: await accountId(db, "supplier_payable", inv.supplierId),
      feeIncome: await accountId(db, "fee_income", null),
    });

    await bookMovement(db, {
      invoiceId: id,
      type: "disbursement",
      evidenceRef: `demo:disbursement:${id.slice(0, 8)}`,
      idempotencyKey: `disbursement:${id}`,
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

// THE APP'S FIRST ROUTE HANDLER, and its first unauthenticated write path.
//
// Every other write in this product begins with a person clicking something.
// This one begins with a stranger's HTTP request, so it is built inside-out
// from that fact:
//
//   · Its ONLY credential is the signature. There is no seat, no cookie, no
//     session — getIdentity() is never called here, deliberately.
//   · It FAILS CLOSED. Flag off, missing signature, bad signature, malformed
//     body: refused and recorded, never processed "just in case".
//   · The body is a DOORBELL, NEVER EVIDENCE. Nothing in the payload is
//     trusted — the delivery only prompts us to go and re-read Circle's own
//     record. That is also why out-of-order delivery cannot matter: no
//     delivery's CLAIM is ever used, only its arrival.
//   · It books through completeSettlement(), the same path the initiating
//     request and Check status use. There is no second booking path.
//
// It books UNATTENDED, by Chetan's decision (2026-09-15): ops authorised the
// movement when they pressed the gate, and no bank waits for an operator
// before settling. That is precisely why Part 2's "no agent" verdict matters —
// nothing probabilistic may ever sit on this path.

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { pendingSettlements, webhookDeliveries } from "@/db/schema";
import { completeSettlement } from "@/lib/settlement/pending";
import {
  isTrustedSubscribeUrl,
  verifyDelivery,
} from "@/lib/webhooks/circle-signature";

export const dynamic = "force-dynamic";

type Outcome = (typeof webhookDeliveries.$inferInsert)["outcome"];

export async function POST(request: Request): Promise<Response> {
  // The flag is public by name so the pricing form can hide the rail, but a
  // public flag is never a permission: it is checked here, on the server, too.
  if (!process.env.NEXT_PUBLIC_ENABLE_CIRCLE_RAIL) {
    return new Response("fiat rail disabled", { status: 404 });
  }

  // RAW BYTES FIRST, always — the record is of what was sent, not of what we
  // made of it. WHICH SCHEME verifies it depends on what the delivery carries:
  // a header-signed delivery is verified against the raw bytes; an SNS
  // envelope is verified against the canonical string SNS actually signed,
  // which can only be built after parsing. See circle-signature.ts. Nothing is
  // ACTED ON either way until verification holds.
  const rawBody = await request.text();

  const verdict = await verifyDelivery(request.headers, rawBody);
  if (!verdict.valid) {
    await record(rawBody, false, "refused-signature", null, null);
    // 403, not 200: a legitimate delivery whose key fetch failed SHOULD be
    // retried by the sender. A forgery retrying costs nothing but a log line.
    return new Response("signature refused", { status: 403 });
  }

  let body: Record<string, unknown>;
  if (verdict.body) {
    body = verdict.body;
  } else {
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      await record(rawBody, true, "unmatched", null, null);
      return new Response("unparseable body", { status: 400 });
    }
  }

  // ── the SNS handshake ─────────────────────────────────────────────────────
  if (body.Type === "SubscriptionConfirmation" && typeof body.SubscribeURL === "string") {
    if (!isTrustedSubscribeUrl(body.SubscribeURL)) {
      // A URL that arrives in a request body is not a URL to fetch. Refusing
      // an unexpected host is what stops this endpoint becoming a proxy.
      await record(rawBody, true, "refused-signature", null, null);
      return new Response("untrusted SubscribeURL", { status: 400 });
    }
    await fetch(body.SubscribeURL, { method: "GET" });
    await record(rawBody, true, "applied", null, null);
    return new Response("subscription confirmed", { status: 200 });
  }

  // ── a notification ────────────────────────────────────────────────────────
  const reference = extractReference(body);
  const db = getDb();

  // Outbound legs carry Circle's payout id, which IS the pending row's
  // reference. Inbound legs never had an id — the deposit is recognised by
  // amount and window — so any inbound notification re-checks the open inbound
  // legs, and completeSettlement decides which (if any) has arrived.
  const rows = reference
    ? await db.select().from(pendingSettlements).where(eq(pendingSettlements.railReference, reference))
    : [];

  const targets = rows.length
    ? rows
    : await db
        .select()
        .from(pendingSettlements)
        .where(
          inArray(pendingSettlements.status, ["initiating", "initiated"]),
        )
        .then((open) => open.filter((r) => r.railReference?.startsWith("inbound:")));

  if (targets.length === 0) {
    // Authentic, well-formed, and about nothing we are waiting for. Recorded
    // as unmatched — the first real instance of cycle 3's unmatched-reference
    // exception — and acknowledged so the sender stops retrying.
    await record(rawBody, true, "unmatched", reference, null);
    return new Response("no matching settlement", { status: 200 });
  }

  let applied = 0;
  for (const row of targets) {
    const outcome = await completeSettlement(db, row.id);
    if (outcome.status === "settled") {
      applied++;
      revalidatePath("/ops");
      revalidatePath(`/ops/deals/${row.invoiceId}`);
      revalidatePath("/ops/ledger");
      revalidatePath("/supplier");
      revalidatePath("/funder");
      revalidatePath(`/pay/${row.invoiceId}`);
    }
    await record(
      rawBody,
      true,
      outcome.status === "settled" ? "applied" : "ignored",
      reference,
      row.id,
    );
  }

  // Always 2xx once authentic and understood — a duplicate delivery is a
  // no-op, not an error, and telling the sender otherwise invites a retry
  // storm for something that already worked.
  return new Response(`resolved ${applied} of ${targets.length}`, { status: 200 });
}

/**
 * Circle's notification payloads nest the interesting object under a key that
 * depends on the topic, and SNS wraps the whole thing in `Message` as a JSON
 * STRING. Every location is tried and none is required: a delivery we cannot
 * read an id from is recorded as unmatched rather than guessed at.
 */
function extractReference(body: Record<string, unknown>): string | null {
  let payload: Record<string, unknown> = body;
  if (typeof body.Message === "string") {
    try {
      payload = JSON.parse(body.Message) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  for (const key of ["payout", "payment", "deposit", "transfer"]) {
    const nested = payload[key];
    if (nested && typeof nested === "object" && typeof (nested as { id?: unknown }).id === "string") {
      return (nested as { id: string }).id;
    }
  }
  return typeof payload.id === "string" ? payload.id : null;
}

/**
 * EVERY delivery is recorded, including the refused ones — that is what makes
 * duplicate, out-of-order and forged delivery provable rather than asserted,
 * and it is the evidence the evals read.
 */
async function record(
  rawBody: string,
  signatureValid: boolean,
  outcome: Outcome,
  externalId: string | null,
  resolvedPendingId: string | null,
): Promise<void> {
  try {
    await getDb()
      .insert(webhookDeliveries)
      .values({
        source: "circle",
        externalId,
        signatureValid,
        rawBody: rawBody.slice(0, 20_000),
        resolvedPendingId,
        outcome,
      });
  } catch {
    // Recording must never be the reason a legitimate settlement fails to
    // book. The delivery log is evidence, not a control.
  }
}

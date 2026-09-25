"use server";

// The only writers of the identity cookie. Party claims are validated against
// the database before they are stored — the browser posts a decision ("act as
// this seat/party"), the server decides whether it is real.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { parties } from "@/db/schema";
import { IDENTITY_COOKIE, SEATS, serializeIdentity, safeLocalPath, type Seat } from "./parse";

const SEAT_HOME: Record<Seat, string> = {
  supplier: "/supplier",
  ops: "/ops",
  funder: "/funder",
  debtor: "/pay",
};

const SEAT_PARTY_ROLE: Partial<Record<Seat, "supplier" | "funder">> = {
  supplier: "supplier",
  funder: "funder",
};

export async function switchSeat(formData: FormData) {
  const seat = String(formData.get("seat"));
  if (!(SEATS as readonly string[]).includes(seat)) return;
  const s = seat as Seat;

  // Seats that act for a party get a deterministic default: first by name.
  let partyId: string | null = null;
  const partyRole = SEAT_PARTY_ROLE[s];
  if (partyRole) {
    const db = getDb();
    const [p] = await db
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.role, partyRole))
      .orderBy(asc(parties.name))
      .limit(1);
    partyId = p?.id ?? null;
  }

  (await cookies()).set(IDENTITY_COOKIE, serializeIdentity({ seat: s, partyId }), {
    path: "/",
    sameSite: "lax",
  });
  // The role-gate card passes the page the visitor was trying to reach, so
  // switching seats lands them there instead of the seat's home. Validated —
  // a redirect target from a form is a claim like any other.
  redirect(safeLocalPath(formData.get("returnTo")) ?? SEAT_HOME[s]);
}

export async function actAsSupplier(formData: FormData) {
  const partyId = String(formData.get("partyId"));
  const db = getDb();
  const [p] = await db
    .select({ id: parties.id })
    .from(parties)
    .where(and(eq(parties.id, partyId), eq(parties.role, "supplier")));
  if (!p) return; // not a supplier — the claim is dropped, not honored

  (await cookies()).set(
    IDENTITY_COOKIE,
    serializeIdentity({ seat: "supplier", partyId: p.id }),
    { path: "/", sameSite: "lax" },
  );
  redirect("/supplier");
}

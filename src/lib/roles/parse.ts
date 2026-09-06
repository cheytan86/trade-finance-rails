// Pure identity parsing — no server imports, fully testable. The cookie is a
// claim from the browser and is validated like one: unknown seats, malformed
// JSON and non-UUID party ids all collapse to null (no identity), never to a
// privileged default.

export const SEATS = ["supplier", "ops", "funder", "debtor"] as const;
export type Seat = (typeof SEATS)[number];

export interface Identity {
  seat: Seat;
  partyId: string | null;
}

export const IDENTITY_COOKIE = "tfr_identity";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseIdentity(raw: string | undefined | null): Identity | null {
  if (!raw) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (obj === null || typeof obj !== "object") return null;
  const { seat, partyId } = obj as { seat?: unknown; partyId?: unknown };
  if (typeof seat !== "string" || !(SEATS as readonly string[]).includes(seat)) return null;
  return {
    seat: seat as Seat,
    partyId: typeof partyId === "string" && UUID_RE.test(partyId) ? partyId : null,
  };
}

export function serializeIdentity(id: Identity): string {
  return JSON.stringify({ seat: id.seat, partyId: id.partyId });
}

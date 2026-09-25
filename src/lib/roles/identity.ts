// THE IDENTITY SEAM (design §6, decided 2026-09-06). Every surface and route
// answers "who is acting" through getIdentity() and nothing else — no other
// module may read the cookie. Cycle 0's implementation is a role cookie; the
// accounts-mode cycle (4a) swaps real sessions in behind this same function,
// selected by AUTH_MODE. That swap stays a module swap only as long as this
// file is the single reader.

import { cookies } from "next/headers";
import { parseIdentity, IDENTITY_COOKIE, type Identity, type Seat } from "./parse";

export type { Identity, Seat };

export async function getIdentity(): Promise<Identity | null> {
  const store = await cookies(); // Next 16: cookies() is async
  return parseIdentity(store.get(IDENTITY_COOKIE)?.value);
}

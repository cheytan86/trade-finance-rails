import { getIdentity } from "./identity";
import { RoleGate } from "@/components/role-gate";
import type { Seat } from "./parse";

/**
 * Seat enforcement for PAGES — deliberately not a layout: a layout that
 * withholds {children} only hides them, the page still renders server-side
 * and its data still ships in the RSC payload (verified by curl during A4,
 * not theorized). Every gated page starts with:
 *
 *   const gate = await seatGate("supplier");
 *   if (gate) return gate;
 *
 * so a wrong-seat request returns the gate card and the page's queries
 * NEVER RUN.
 */
export async function seatGate(required: Seat): Promise<React.ReactNode | null> {
  const identity = await getIdentity();
  if (identity && identity.seat !== required) {
    return <RoleGate required={required} current={identity.seat} />;
  }
  return null;
}

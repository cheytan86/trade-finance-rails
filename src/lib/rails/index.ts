// The rail registry — the one place the app turns a deal's stored rail into
// an implementation. Adding a rail (Circle in cycle 2, mock Open USD and the
// Visa adapter in cycle 11) means adding a line here and nothing else.

import { demoInternalRail } from "./demo-internal.ts";
import { usdcRail } from "./usdc.ts";
import { RailError, type RailId, type SettlementRail } from "./types.ts";

// Partial, deliberately: `circle-fiat` exists as a RailId from migration 0005
// (the enum values had to land together) but has no implementation until A4.
// railFor's existing not-found guard is the honest answer in the meantime —
// the concept is declared, the capability is not claimed, and the feature flag
// keeps it unreachable from the UI either way.
const RAILS: Partial<Record<RailId, SettlementRail>> = {
  "demo-internal": demoInternalRail,
  usdc: usdcRail,
};

export function railFor(id: RailId): SettlementRail {
  const rail = RAILS[id];
  if (!rail) {
    throw new RailError("rail-unknown", `No settlement rail named "${id}" is registered.`);
  }
  return rail;
}

export const ALL_RAILS: SettlementRail[] = Object.values(RAILS);

export * from "./types.ts";
export { centsToTokenUnits, tokenUnitsToCents, USDC_ADDRESS } from "./usdc.ts";
export { verifyUsdcTransfer, assertTestnet, BASE_SEPOLIA } from "./verify-usdc.ts";

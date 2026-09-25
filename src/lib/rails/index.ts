// The rail registry — the one place the app turns a deal's stored rail into
// an implementation. Adding a rail (Circle in cycle 2, mock Open USD and the
// Visa adapter in cycle 11) means adding a line here and nothing else.

import { demoInternalRail } from "./demo-internal.ts";
import { usdcRail } from "./usdc.ts";
import { circleFiatRail } from "./circle.ts";
import { RailError, type RailId, type SettlementRail } from "./types.ts";

// One line per rail, as this file's header has promised since cycle 1.
const RAILS: Partial<Record<RailId, SettlementRail>> = {
  "demo-internal": demoInternalRail,
  usdc: usdcRail,
  "circle-fiat": circleFiatRail,
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
export { verifyCirclePayout, matchInboundDeposit } from "./verify-circle.ts";
export { minorToDecimal, decimalToMinor } from "./circle-client.ts";

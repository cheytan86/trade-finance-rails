import { describe, it, expect } from "vitest";
import { railFor, ALL_RAILS, RailError } from "./index";
import { centsToTokenUnits, tokenUnitsToCents } from "./usdc";
import { demoInternalRail } from "./demo-internal";

// THE SEAM'S OWN TEST: the state machine must not be able to tell rails
// apart. Every rail satisfies the same shape, and the trivial one behaves.

describe("the registry", () => {
  it("resolves both cycle-1 rails and refuses an unknown one", () => {
    expect(railFor("demo-internal").id).toBe("demo-internal");
    expect(railFor("usdc").id).toBe("usdc");
    expect(() => railFor("swift" as never)).toThrowError(/No settlement rail named/);
  });

  it("every registered rail satisfies the interface", () => {
    for (const rail of ALL_RAILS) {
      expect(typeof rail.id, rail.id).toBe("string");
      expect(rail.label.length, rail.id).toBeGreaterThan(0);
      for (const fn of ["prepare", "execute", "verify"] as const) {
        expect(typeof rail[fn], `${rail.id}.${fn}`).toBe("function");
      }
    }
  });

  it("every rail's label says demo or testnet — no rail may look production", () => {
    for (const rail of ALL_RAILS) {
      expect(rail.label.toLowerCase(), rail.id).toMatch(/demo|testnet/);
    }
  });
});

describe("cents ↔ token units (the 2dp/6dp boundary)", () => {
  it("converts exactly in both directions", () => {
    expect(centsToTokenUnits(1_000_00n)).toBe(1_000_000_000n); // 1,000.00 = 100,000c → 1,000 × 10⁶
    expect(centsToTokenUnits(1n)).toBe(10_000n); // one cent
    expect(tokenUnitsToCents(10_000_000n)).toBe(1_000n); // 10 USDC → 1000 cents
  });
  it("refuses an on-chain amount the ledger cannot represent", () => {
    // A transfer of 0.0000001 USDC — real on-chain, sub-cent, unbookable.
    try {
      tokenUnitsToCents(10_000_001n);
      expect.unreachable();
    } catch (e) {
      expect((e as RailError).rule).toBe("rail-subcent-amount");
    }
  });
});

describe("the trivial rail behaves like a rail", () => {
  const req = {
    idempotencyKey: "funding:inv-1",
    from: "funder" as const,
    to: "platform" as const,
    amountMinor: 4_080_000n,
  };

  it("previews without claiming to be on-chain", async () => {
    const p = await demoInternalRail.prepare(req);
    expect(p.onChain).toBe(false);
    expect(p.amountMinor).toBe(req.amountMinor);
    expect(p.fromLabel).toMatch(/demo-internal/);
  });

  it("executes to a reference derived from the idempotency key", async () => {
    const r = await demoInternalRail.execute(req);
    expect(r.reference).toBe("demo:funding:inv-1");
    const v = await demoInternalRail.verify(req, r);
    expect(v.evidenceKind).toBe("demo-internal");
    expect(v.amountMinor).toBe(req.amountMinor);
    expect(v.explorerUrl).toBeUndefined();
  });

  it("refuses evidence belonging to another movement", async () => {
    await expect(
      demoInternalRail.verify(req, { reference: "demo:funding:inv-OTHER" }),
    ).rejects.toThrowError(/does not belong to this movement/);
  });

  it("refuses a non-positive amount", async () => {
    await expect(demoInternalRail.execute({ ...req, amountMinor: 0n })).rejects.toThrowError(
      /positive amount/,
    );
  });
});

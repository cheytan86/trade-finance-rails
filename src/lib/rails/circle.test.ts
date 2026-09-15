// The fiat rail's own guards. Nothing here calls Circle: these are the
// refusals that must happen BEFORE any network request, and the promises the
// rail makes to the screens.

import { describe, it, expect } from "vitest";
import { circleFiatRail } from "./circle";
import { circleIdempotencyKey, createPayout, minorToDecimal } from "./circle-client";
import { RailError } from "./types";

const req = (over: Partial<Parameters<typeof circleFiatRail.prepare>[0]> = {}) => ({
  idempotencyKey: "disbursement:inv-1",
  from: "platform" as const,
  to: "supplier" as const,
  amountMinor: 4_080_000n,
  ...over,
});

describe("the rail cannot be pointed at production", () => {
  it("REFUSES a key without the sandbox prefix", async () => {
    // The single most important guard in this file. A production Circle key
    // would move real money, and this product's whole posture is that it
    // cannot. The refusal is absolute and happens before any request.
    await expect(
      createPayout(
        { idempotencyKey: "k", destinationId: "d", amount: { amount: "1.00", currency: "USD" } },
        { CIRCLE_API_KEY: "LIVE_abc123" },
      ),
    ).rejects.toThrow(/refuses to run against production/);
  });

  it("refuses when no key is configured, naming the runbook", async () => {
    await expect(
      createPayout(
        { idempotencyKey: "k", destinationId: "d", amount: { amount: "1.00", currency: "USD" } },
        {},
      ),
    ).rejects.toThrow(/circle-sandbox-runbook/);
  });
});

describe("the rail declares what it is", () => {
  it("is DEFERRED — the first rail that cannot settle inside the request", () => {
    expect(circleFiatRail.settlement).toBe("deferred");
  });

  it("never looks like production, in the label the screens render", () => {
    expect(circleFiatRail.label.toLowerCase()).toMatch(/sandbox|no real money/);
  });
});

describe("prepare refuses before the human gate opens, never after", () => {
  it("REFUSES an outbound leg with no registered bank account", async () => {
    // An operator must not confirm a movement that was never going to be
    // possible. The design puts this at prepare for exactly that reason.
    await expect(circleFiatRail.prepare(req())).rejects.toThrow(RailError);
    await expect(circleFiatRail.prepare(req())).rejects.toThrow(/No bank account is registered/);
  });

  it("allows an outbound leg once a destination is supplied", async () => {
    const p = await circleFiatRail.prepare(req({ toRef: "bank-account-id" }));
    expect(p.rail).toBe("circle-fiat");
    expect(p.onChain).toBe(false);
    expect(p.amountMinor).toBe(4_080_000n);
  });

  it("warns the operator that this rail settles LATER, before they confirm", async () => {
    const p = await circleFiatRail.prepare(req({ toRef: "bank-account-id" }));
    expect(p.note).toMatch(/settles later/i);
    expect(p.note).toMatch(/nothing books/i);
  });

  it("an inbound leg needs no destination, and admits the platform stands in", async () => {
    // Honesty that has to survive into the UI: in sandbox the platform is
    // simulating the counterparty's bank, exactly as the demo wallets do.
    const p = await circleFiatRail.prepare(req({ from: "debtor", to: "platform" }));
    expect(p.note).toMatch(/stands in for their bank/i);
    expect(p.toLabel).toMatch(/sandbox/);
  });

  it("refuses a non-positive amount", async () => {
    await expect(
      circleFiatRail.execute(req({ toRef: "bank-account-id", amountMinor: 0n })),
    ).rejects.toThrow(/positive amount/);
  });
});

describe("amounts cross the boundary exactly", () => {
  it("renders the ledger's cents as Circle's decimal string", () => {
    expect(minorToDecimal(4_080_000n)).toBe("40800.00");
    expect(minorToDecimal(300n)).toBe("3.00");
    expect(minorToDecimal(5n)).toBe("0.05");
  });
});

describe("our idempotency key becomes Circle's, deterministically", () => {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("produces a valid UUID — Circle 422s on anything else", () => {
    // Found live on 2026-09-15: passing the ledger key "disbursement:inv-1"
    // returns 422 with no field named.
    expect(circleIdempotencyKey("disbursement:inv-1")).toMatch(UUID);
    expect(circleIdempotencyKey("funding:9f2c")).toMatch(UUID);
  });

  it("IS STABLE for the same leg — the property that actually matters", () => {
    // A retry must reuse the same Circle key. A fresh random UUID per attempt
    // would satisfy the 422 and silently let Circle create a SECOND payout.
    const a = circleIdempotencyKey("payout:inv-77");
    const b = circleIdempotencyKey("payout:inv-77");
    expect(a).toBe(b);
  });

  it("differs between legs of the same deal", () => {
    expect(circleIdempotencyKey("payout:inv-77")).not.toBe(circleIdempotencyKey("residual:inv-77"));
  });
});

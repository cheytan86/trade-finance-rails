// Circle's verifier, proved by its REFUSALS — the same standard cycle 1 held
// verify-usdc.ts to. A verifier that only passes its happy path has not been
// tested, it has been demonstrated.
//
// Fixtures are shaped from a LIVE sandbox response recorded 2026-09-15
// (docs/circle-sandbox-runbook.md), not from memory of Circle's docs.

import { describe, it, expect } from "vitest";
import { RailError } from "./types";
import { decimalToMinor, minorToDecimal, type CircleDeposit, type CirclePayout } from "./circle-client";
import { matchInboundDeposit, verifyCirclePayout, type ExpectedMovement } from "./verify-circle";

const DESTINATION = "fbf1313c-8898-4fcb-b9d5-6932ff67395b";

const expected: ExpectedMovement = {
  amountMinor: 4_080_000n, // 40,800.00
  currency: "USD",
  destinationId: DESTINATION,
  fromLabel: "platform Circle account (sandbox)",
  toLabel: "supplier's bank (sandbox)",
};

const payout = (over: Partial<CirclePayout> = {}): CirclePayout => ({
  id: "cd5d0a5e-2b0e-4b6f-9f5e-7d1b6a2c9f11",
  amount: { amount: "40800.00", currency: "USD" },
  status: "complete",
  destination: { type: "wire", id: DESTINATION },
  createDate: "2026-09-15T09:43:02.861Z",
  ...over,
});

const deposit = (over: Partial<CircleDeposit> = {}): CircleDeposit => ({
  id: "5ec3e2b9-8f05-49db-9ffe-4025573c2e90",
  amount: { amount: "40800.00", currency: "USD" },
  status: "complete",
  source: { id: DESTINATION, type: "wire", name: "WELLS FARGO BANK, NA ****0010" },
  createDate: new Date().toISOString(),
  ...over,
});

describe("money conversion never loses a cent", () => {
  it("round-trips whole and fractional amounts", () => {
    for (const minor of [0n, 1n, 99n, 100n, 4_080_000n, 5_000_000_00n]) {
      expect(decimalToMinor(minorToDecimal(minor))).toBe(minor);
    }
  });

  it("formats cents with both digits — 40800.05, never 40800.5", () => {
    expect(minorToDecimal(4_080_005n)).toBe("40800.05");
    expect(minorToDecimal(4_080_050n)).toBe("40800.50");
  });

  it("REFUSES an amount the ledger cannot represent exactly", () => {
    // Three decimal places is not a rounding problem to solve quietly — it is
    // a number this ledger cannot hold, and the money module's rule is that a
    // float never becomes money.
    expect(() => decimalToMinor("10.005")).toThrow(RailError);
    expect(() => decimalToMinor("not a number")).toThrow(RailError);
  });
});

describe("a payout is verified against Circle's own record", () => {
  it("settles when complete, with the payment id as evidence", () => {
    const out = verifyCirclePayout(payout(), expected);
    expect(out.status).toBe("settled");
    if (out.status !== "settled") throw new Error("unreachable");
    expect(out.transfer.evidenceKind).toBe("circle-payment-id");
    expect(out.transfer.amountMinor).toBe(4_080_000n);
    // THE PRODUCT'S POINT, asserted: this evidence is real and it is NOT
    // independently checkable. No explorer link exists, and none is invented.
    expect(out.transfer.explorerUrl).toBeUndefined();
  });

  it("is PENDING while Circle is still thinking — not an error", () => {
    const out = verifyCirclePayout(payout({ status: "pending" }), expected);
    expect(out.status).toBe("pending");
  });

  it("is FAILED when Circle says so, carrying its reason", () => {
    const out = verifyCirclePayout(
      payout({ status: "failed", errorCode: "insufficient_funds" }),
      expected,
    );
    expect(out.status).toBe("failed");
    if (out.status !== "failed") throw new Error("unreachable");
    expect(out.reason).toMatch(/insufficient_funds/);
  });

  it("REFUSES a payout that went to the wrong account, even for the right amount", () => {
    // Checked BEFORE the amount on purpose: money in a stranger's account is
    // the worst outcome, and a matching amount must never let it through.
    expect(() =>
      verifyCirclePayout(payout({ destination: { type: "wire", id: "someone-else" } }), expected),
    ).toThrow(/not fbf1313c/);
  });

  it("REFUSES a wrong amount, and names the reconciliation cycle", () => {
    expect(() => verifyCirclePayout(payout({ amount: { amount: "40700.00", currency: "USD" } }), expected))
      .toThrow(/cycle 3/);
  });

  it("REFUSES a different currency rather than converting", () => {
    expect(() =>
      verifyCirclePayout(payout({ amount: { amount: "40800.00", currency: "EUR" } }), expected),
    ).toThrow(/does not convert/);
  });

  it("refuses a completed payout that carries no destination at all", () => {
    expect(() => verifyCirclePayout(payout({ destination: undefined }), expected)).toThrow(RailError);
  });
});

describe("an inbound deposit is recognised, not looked up", () => {
  const inbound: ExpectedMovement = { ...expected, destinationId: undefined };
  const initiated = new Date(Date.now() - 5 * 60_000);

  it("is PENDING when nothing has arrived", () => {
    expect(matchInboundDeposit([], inbound, initiated).status).toBe("pending");
  });

  it("settles on an exact-amount match inside the window", () => {
    const out = matchInboundDeposit([deposit()], inbound, initiated);
    expect(out.status).toBe("settled");
    if (out.status !== "settled") throw new Error("unreachable");
    expect(out.transfer.reference).toBe("5ec3e2b9-8f05-49db-9ffe-4025573c2e90");
  });

  it("ignores a deposit for a different amount", () => {
    const other = deposit({ amount: { amount: "999.00", currency: "USD" } });
    expect(matchInboundDeposit([other], inbound, initiated).status).toBe("pending");
  });

  it("ignores a deposit that landed BEFORE we asked for the money", () => {
    const old = deposit({ createDate: new Date(Date.now() - 6 * 60 * 60_000).toISOString() });
    expect(matchInboundDeposit([old], inbound, initiated).status).toBe("pending");
  });

  it("stays pending while the matching deposit is itself pending", () => {
    expect(matchInboundDeposit([deposit({ status: "pending" })], inbound, initiated).status).toBe(
      "pending",
    );
  });

  it("REFUSES two identical deposits rather than guessing which one this is", () => {
    // The honest failure of amount-matching, and the reason cycle 3 exists.
    // Picking either one would book real money against the wrong invoice.
    const out = matchInboundDeposit(
      [deposit(), deposit({ id: "a-second-one" })],
      inbound,
      initiated,
    );
    expect(out.status).toBe("pending");
    expect(out.status === "pending" && out.detail).toMatch(/cannot be told apart/);
  });

  it("FIX B — an ambiguity leaves the leg alive, because nothing failed", () => {
    // What changed at cycle 3 is not the refusal, it is its cost. This used to
    // throw; completeSettlement catches every throw as a mismatch and marks
    // the leg `failed`, which is terminal — so an ambiguity killed a leg that
    // nothing was wrong with, while the money sat there. `pending` means book
    // nothing, fail nothing, stay in flight, which is exactly right.
    const out = matchInboundDeposit(
      [deposit(), deposit({ id: "a-second-one" })],
      inbound,
      initiated,
    );
    expect(out.status).not.toBe("failed");
    expect(out.status).not.toBe("settled");
    // And it tells a person what to do rather than only what went wrong.
    expect(out.status === "pending" && out.detail).toMatch(/by hand/);
  });

  it("A3 — a deposit that already settled something is not a candidate again", () => {
    // Without this, a spent deposit goes on colliding with every later leg of
    // the same amount, manufacturing ambiguity out of money already accounted
    // for. With it, the one unspent deposit matches cleanly.
    const spent = new Set(["dep-1"]);
    const out = matchInboundDeposit(
      [deposit({ id: "dep-1" }), deposit({ id: "dep-2" })],
      inbound,
      initiated,
      spent,
    );
    expect(out.status).toBe("settled");
    expect(out.status === "settled" && out.transfer.reference).toBe("dep-2");
  });

  it("A3 — when every candidate is spent, it is pending, not a false match", () => {
    const out = matchInboundDeposit(
      [deposit({ id: "dep-1" })],
      inbound,
      initiated,
      new Set(["dep-1"]),
    );
    expect(out.status).toBe("pending");
  });

  it("does not match a failed deposit", () => {
    expect(matchInboundDeposit([deposit({ status: "failed" })], inbound, initiated).status).toBe(
      "pending",
    );
  });
});

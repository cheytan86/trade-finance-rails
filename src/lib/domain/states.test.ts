import { describe, it, expect } from "vitest";
import { INVOICE_STATUSES, canTransition, assertTransition, StateError } from "./states";

// The full matrix, pinned: exactly these four transitions exist, and no other
// pair is legal. 5 × 5 = 25 pairs; 4 allowed, 21 refused.
const ALLOWED = new Set([
  "submitted→approved",
  "submitted→refused",
  "approved→funded",
  "funded→disbursed",
]);

describe("the designed transitions", () => {
  it("allows exactly the four designed moves and nothing else", () => {
    let allowed = 0;
    for (const from of INVOICE_STATUSES) {
      for (const to of INVOICE_STATUSES) {
        const key = `${from}→${to}`;
        expect(canTransition(from, to), key).toBe(ALLOWED.has(key));
        if (canTransition(from, to)) allowed++;
      }
    }
    expect(allowed).toBe(4);
  });
});

describe("refusals name their rule", () => {
  it("disbursing an unfunded invoice says why (eval case 3's backbone)", () => {
    try {
      assertTransition("approved", "disbursed");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(StateError);
      expect((e as StateError).rule).toBe("state-approved-to-disbursed");
      expect((e as StateError).message).toContain("only a funded invoice");
    }
  });
  it("funding a submitted invoice names the missing approval", () => {
    expect(() => assertTransition("submitted", "funded")).toThrowError(
      /only an approved invoice/,
    );
  });
  it("terminal states say they are terminal", () => {
    expect(() => assertTransition("refused", "approved")).toThrowError(/terminal/);
    expect(() => assertTransition("disbursed", "funded")).toThrowError(/terminal/);
  });
});

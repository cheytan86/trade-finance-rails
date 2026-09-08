import { describe, it, expect } from "vitest";
import { INVOICE_STATUSES, canTransition, assertTransition, StateError } from "./states";

// The full matrix, pinned: exactly these six transitions exist, and no other
// pair is legal. 7 × 7 = 49 pairs; 6 allowed, 43 refused.
// (Grew from 5 states / 4 transitions at cycle 1 — the deal's back half.)
const ALLOWED = new Set([
  "submitted→approved",
  "submitted→refused",
  "approved→funded",
  "funded→disbursed",
  "disbursed→repaid",
  "repaid→settled",
]);

describe("the designed transitions", () => {
  it("allows exactly the six designed moves and nothing else", () => {
    let allowed = 0;
    for (const from of INVOICE_STATUSES) {
      for (const to of INVOICE_STATUSES) {
        const key = `${from}→${to}`;
        expect(canTransition(from, to), key).toBe(ALLOWED.has(key));
        if (canTransition(from, to)) allowed++;
      }
    }
    expect(allowed).toBe(6);
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
    // `settled` is the end of the line since cycle 1; `disbursed` no longer is.
    expect(() => assertTransition("settled", "repaid")).toThrowError(/terminal/);
  });

  it("the back half's refusals name their own rules", () => {
    expect(() => assertTransition("funded", "repaid")).toThrowError(
      /only a disbursed invoice can be repaid/,
    );
    expect(() => assertTransition("disbursed", "settled")).toThrowError(
      /settles only after repayment/,
    );
    // and a disbursed deal cannot be re-funded — the reason is the rule that
    // binds, not terminality
    expect(() => assertTransition("disbursed", "funded")).toThrowError(
      /only an approved invoice can be funded/,
    );
  });
});

import { describe, it, expect } from "vitest";
import { INVOICE_STATUSES, canTransition, assertTransition, StateError } from "./states";

// The full matrix, pinned: exactly these nine transitions exist, and no
// other pair is legal. 9 × 9 = 81 pairs; 9 allowed, 72 refused.
// `submitted ⇄ returned` is the only two-way edge in the machine.
// (5 states / 4 transitions at cycle 0 → the back half → the pricing step.)
const ALLOWED = new Set([
  "submitted→approved",
  "submitted→returned",
  "submitted→refused",
  "returned→submitted",
  "approved→priced",
  "priced→funded",
  "funded→disbursed",
  "disbursed→repaid",
  "repaid→settled",
]);

describe("the designed transitions", () => {
  it("allows exactly the nine designed moves and nothing else", () => {
    let allowed = 0;
    for (const from of INVOICE_STATUSES) {
      for (const to of INVOICE_STATUSES) {
        const key = `${from}→${to}`;
        expect(canTransition(from, to), key).toBe(ALLOWED.has(key));
        if (canTransition(from, to)) allowed++;
      }
    }
    expect(allowed).toBe(9);
  });
});

describe("refusals name their rule", () => {
  it("funding an approved-but-unpriced deal names the missing step", () => {
    try {
      assertTransition("approved", "funded");
      expect.unreachable();
    } catch (e) {
      expect((e as StateError).message).toMatch(/not yet priced — set its rate card first/);
    }
  });

  it("a returned deal explains that it is waiting on the supplier", () => {
    for (const to of ["approved", "priced", "funded", "refused"] as const) {
      expect(() => assertTransition("returned", to), to).toThrowError(
        /returned to the supplier for correction/,
      );
    }
    // …and the one move it does allow is the supplier resubmitting.
    expect(() => assertTransition("returned", "submitted")).not.toThrow();
  });

  it("returning is only possible during validation", () => {
    expect(() => assertTransition("approved", "returned")).toThrowError(
      /only a deal awaiting validation can be returned/,
    );
    expect(() => assertTransition("funded", "returned")).toThrowError(
      /only a deal awaiting validation can be returned/,
    );
  });

  it("pricing anything but an approved deal is refused", () => {
    expect(() => assertTransition("submitted", "priced")).toThrowError(
      /only an approved deal can be priced/,
    );
    expect(() => assertTransition("funded", "priced")).toThrowError(
      /only an approved deal can be priced/,
    );
  });

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
  it("funding a submitted invoice names the missing step", () => {
    expect(() => assertTransition("submitted", "funded")).toThrowError(
      /only a priced deal can be funded/,
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
      /only a priced deal can be funded/,
    );
  });
});

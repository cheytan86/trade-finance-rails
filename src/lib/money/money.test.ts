import { describe, it, expect } from "vitest";
import { assertMinorUnits, divRound, mulBps, interestActDays, formatMinor, MoneyError } from "./index";

describe("assertMinorUnits — the float refusal at the boundary", () => {
  it("accepts bigint and digit strings", () => {
    expect(assertMinorUnits(4_080_000n, "x")).toBe(4_080_000n);
    expect(assertMinorUnits("4080000", "x")).toBe(4_080_000n);
    expect(assertMinorUnits("-150", "x")).toBe(-150n);
  });
  it("refuses numbers — even whole ones — and fractions", () => {
    expect(() => assertMinorUnits(40800.0, "faceValue")).toThrowError(MoneyError);
    expect(() => assertMinorUnits("40800.50", "faceValue")).toThrowError(/minor units/);
    expect(() => assertMinorUnits(null, "faceValue")).toThrowError(MoneyError);
  });
  it("names its rule", () => {
    try {
      assertMinorUnits(1.5, "amount");
      expect.unreachable();
    } catch (e) {
      expect((e as MoneyError).rule).toBe("money-integer");
    }
  });
});

describe("divRound — half away from zero, documented once", () => {
  it("rounds halves away from zero in both signs", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 2n)).toBe(2n);
    expect(divRound(1n, 3n)).toBe(0n);
    expect(divRound(2n, 3n)).toBe(1n);
  });
});

describe("bps and act/360", () => {
  it("mulBps: 85.00% of 48,000.00 is 40,800.00", () => {
    expect(mulBps(4_800_000n, 8500)).toBe(4_080_000n);
  });
  it("act/360: 9.50% on 40,800.00 over 60 days is 646.00", () => {
    expect(interestActDays(4_080_000n, 950, 60)).toBe(64_600n);
  });
  it("zero tenor accrues nothing; negative tenor refuses", () => {
    expect(interestActDays(4_080_000n, 950, 0)).toBe(0n);
    expect(() => interestActDays(4_080_000n, 950, -1)).toThrowError(MoneyError);
  });
});

describe("formatMinor — display only", () => {
  it("formats with grouping and sign", () => {
    expect(formatMinor(4_000_400n)).toBe("40,004.00");
    expect(formatMinor(-15_000n)).toBe("−150.00");
    expect(formatMinor(5n)).toBe("0.05");
  });
});

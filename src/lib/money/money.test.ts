import { describe, it, expect } from "vitest";
import {
  divRound,
  mulBps,
  interestActDays,
  formatMinor,
  parseDecimalToMinor,
  MoneyError,
} from "./index";

describe("parseDecimalToMinor — the only door human-typed money comes through", () => {
  it("accepts the shapes a person actually types", () => {
    expect(parseDecimalToMinor("48000")).toBe(4_800_000n);
    expect(parseDecimalToMinor("48000.00")).toBe(4_800_000n);
    expect(parseDecimalToMinor("48,000.50")).toBe(4_800_050n);
    expect(parseDecimalToMinor(" 150.5 ")).toBe(15_050n);
  });
  it("refuses rather than rounds when the precision does not fit", () => {
    expect(() => parseDecimalToMinor("48000.005")).toThrowError(/decimal places/);
  });
  it("refuses junk with a sentence naming the field", () => {
    expect(() => parseDecimalToMinor("", 2, "Face value")).toThrowError(/Face value/);
    expect(() => parseDecimalToMinor("1e5")).toThrowError(MoneyError);
    expect(() => parseDecimalToMinor("48000; DROP TABLE")).toThrowError(MoneyError);
    expect(() => parseDecimalToMinor("$48000")).toThrowError(MoneyError);
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

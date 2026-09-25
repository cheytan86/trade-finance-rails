// Money is bigint minor units, everywhere, always (STACK_RULES.md data rules).
// This module is the only place rounding is defined; nothing else may divide.

export class MoneyError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

// Money enters this system through exactly two doors, both here or beside it:
// parseDecimalToMinor (what a person types) and pricing.parseSnapshot (what
// storage returns). There is no third, and no path where a float becomes an
// amount.

/** Integer division rounding half away from zero — the documented rule. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError("money-div-zero", "division by zero");
  const sign = numerator < 0n !== denominator < 0n ? -1n : 1n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  return sign * ((n + d / 2n) / d);
}

/** amount × bps / 10_000, rounded per divRound. */
export function mulBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps)) {
    throw new MoneyError("money-bps-integer", `basis points must be an integer; got ${bps}`);
  }
  return divRound(amount * BigInt(bps), 10_000n);
}

/** act/360 interest: amount × bps × days / (10_000 × 360), one rounding at the end. */
export function interestActDays(amount: bigint, bps: number, days: number): bigint {
  if (!Number.isInteger(bps) || !Number.isInteger(days)) {
    throw new MoneyError("money-act360-integer", "bps and days must be integers");
  }
  if (days < 0) throw new MoneyError("money-negative-tenor", "tenor days cannot be negative");
  return divRound(amount * BigInt(bps) * BigInt(days), 10_000n * 360n);
}

/**
 * Form input → minor units. Accepts "48000", "48,000.00", " 48000.5 ", ".5";
 * refuses anything with more precision than the currency has, an empty
 * string, stray characters, or an AMBIGUOUS COMMA. This is the ONLY place a
 * human-typed amount becomes money, and it refuses rather than rounds.
 *
 * FIX 4 (Chetan, 2026-09-18) — two defects found while pricing a deal by hand.
 *
 * ".1" was refused. A leading point is an ordinary way to write ten cents and
 * the regex below demanded a digit before it, so a correct amount bounced.
 *
 * "0,1" was worse: every comma was stripped as a thousands separator, so a
 * DECIMAL comma — how most of Europe writes money — silently multiplied the
 * amount by ten. "0,1" meaning ten cents became one dollar; "1,5" became
 * fifteen. No refusal, no warning, a wrongly priced deal. A comma is now a
 * thousands separator only when it is grouping three digits properly;
 * anything else is refused by name rather than guessed at.
 */
export function parseDecimalToMinor(input: string, minorDigits = 2, field = "amount"): bigint {
  const trimmed = input.trim();

  // A comma is a separator only in well-formed groups of three: 48,000 and
  // 1,234,567.89 are thousands; 0,1 and 1,5 are somebody's decimal point and
  // must never be silently deleted.
  let cleaned = trimmed;
  if (trimmed.includes(",")) {
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) {
      cleaned = trimmed.replace(/,/g, "");
    } else {
      throw new MoneyError(
        "money-ambiguous-comma",
        `${field}: write the decimal with a point, not a comma — "${input}" could mean two different amounts.`,
      );
    }
  }

  // ".5" is "0.5". Writing the leading zero is a convention, not a rule.
  if (cleaned.startsWith(".")) cleaned = `0${cleaned}`;
  else if (cleaned.startsWith("-.")) cleaned = `-0${cleaned.slice(1)}`;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new MoneyError("money-unparseable", `${field} must be a number like 48000.00; got "${input}".`);
  }
  const [whole, frac = ""] = cleaned.split(".");
  if (frac.length > minorDigits) {
    throw new MoneyError(
      "money-precision",
      `${field} has more than ${minorDigits} decimal places, which this currency cannot hold.`,
    );
  }
  const neg = whole.startsWith("-");
  const digits = `${whole.replace("-", "")}${frac.padEnd(minorDigits, "0")}`;
  const value = BigInt(digits);
  return neg ? -value : value;
}

/** "4000400" → "40,004.00" — display only; never parsed back. */
export function formatMinor(amount: bigint, minorDigits = 2): string {
  const neg = amount < 0n;
  const abs = (neg ? -amount : amount).toString().padStart(minorDigits + 1, "0");
  const whole = abs.slice(0, -minorDigits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}${whole}.${abs.slice(-minorDigits)}`;
}

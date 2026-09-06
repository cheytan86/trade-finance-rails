// Money is bigint minor units, everywhere, always (STACK_RULES.md data rules).
// This module is the only place rounding is defined; nothing else may divide.

export class MoneyError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

/**
 * The API boundary check: accepts a bigint, or a string of digits (form
 * input), and nothing else. A float — even a whole one — is refused, because
 * a number type at a money boundary is how rounding surfaces are born.
 */
export function assertMinorUnits(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new MoneyError(
    "money-integer",
    `${field} must be an integer amount in minor units; got ${typeof value === "number" ? `number ${value}` : JSON.stringify(value)}.`,
  );
}

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

/** "4000400" → "40,004.00" — display only; never parsed back. */
export function formatMinor(amount: bigint, minorDigits = 2): string {
  const neg = amount < 0n;
  const abs = (neg ? -amount : amount).toString().padStart(minorDigits + 1, "0");
  const whole = abs.slice(0, -minorDigits).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}${whole}.${abs.slice(-minorDigits)}`;
}

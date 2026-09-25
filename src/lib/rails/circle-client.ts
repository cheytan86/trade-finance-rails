// The Circle sandbox HTTP surface, and nothing else. Framework-free by the
// same rule as the rest of src/lib/rails: no Next, no database, no React.
//
// Every shape here was READ FROM A LIVE SANDBOX CALL on 2026-09-15, not from
// training data — the request bodies have moved across Circle's API versions
// and the runbook records where guessing cost three opaque 400s.
//
// KEY HYGIENE: the API key is read from the environment at CALL time, never
// captured at module load, never logged, never included in an error message.

import { createHash } from "node:crypto";
import { RailError } from "./types.ts";

/** Injectable for tests, exactly as demoWallet() takes its env. */
export type Env = Record<string, string | undefined>;

const DEFAULT_BASE = "https://api-sandbox.circle.com";

function base(env: Env = process.env): string {
  return env.CIRCLE_API_BASE || DEFAULT_BASE;
}

function apiKey(env: Env = process.env): string {
  const key = env.CIRCLE_API_KEY;
  if (!key) {
    throw new RailError(
      "circle-unconfigured",
      "CIRCLE_API_KEY is missing from .env.local — see docs/circle-sandbox-runbook.md.",
    );
  }
  // A production key would be catastrophic here by definition: this rail is a
  // demonstration and must never be able to move real money. Sandbox keys are
  // SAND_-prefixed, so the check is cheap and the refusal is absolute.
  if (!key.startsWith("SAND_")) {
    throw new RailError(
      "circle-not-sandbox",
      "CIRCLE_API_KEY is not a sandbox key (expected a SAND_ prefix). This rail refuses to run against production.",
    );
  }
  return key;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  env: Env = process.env,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(base(env) + path, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey(env)}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    // Transport failure is NOT a payment failure. The caller decides what to
    // do; the pending row already exists either way.
    throw new RailError(
      "circle-unreachable",
      `Circle could not be reached: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const text = await res.text();
  let parsed: { data?: T; message?: string; code?: number; errors?: Array<{ message?: string; location?: string }> };
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new RailError("circle-bad-response", `Circle returned a non-JSON response (${res.status}).`);
  }

  if (!res.ok) {
    throw new RailError(
      "circle-refused",
      // Circle's sandbox errors are often "Something went wrong" with an
      // errId and no field named — so the path is included, because it is the
      // only thing that narrows it down. (The runbook records the one that
      // cost us: the mock wire wants CIRCLE'S beneficiary account, not ours.)
      `Circle refused ${method} ${path} (${res.status}): ${parsed.message ?? text.slice(0, 200)}${
        parsed.errors?.length
          ? ` — ${parsed.errors.map((e) => [e.location, e.message].filter(Boolean).join(" ")).join("; ")}`
          : ""
      }`,
    );
  }
  return parsed.data as T;
}

// ── the records Circle returns, narrowed to what this rail actually reads ────

export interface CircleAmount {
  amount: string; // decimal string, e.g. "40800.00"
  currency: string;
}

/** Outbound. Created by us; the destination is a registered wire account. */
export interface CirclePayout {
  id: string;
  amount: CircleAmount;
  status: "pending" | "complete" | "failed";
  destination?: { type: string; id: string; name?: string };
  errorCode?: string;
  createDate: string;
}

/** Inbound. Created by the counterparty's bank — in sandbox, by a mock wire. */
export interface CircleDeposit {
  id: string;
  amount: CircleAmount;
  status: "pending" | "complete" | "failed";
  source?: { id: string; type: string; name?: string };
  createDate: string;
}

export interface CircleWireAccount {
  id: string;
  status: string;
  description: string;
  trackingRef: string;
}

// ── the calls ───────────────────────────────────────────────────────────────

/** Pay out to a registered wire bank account. Verified 2026-09-15. */
export async function createPayout(
  p: { idempotencyKey: string; destinationId: string; amount: CircleAmount },
  env?: Env,
): Promise<CirclePayout> {
  return call<CirclePayout>(
    "POST",
    "/v1/businessAccount/payouts",
    {
      idempotencyKey: p.idempotencyKey,
      destination: { type: "wire", id: p.destinationId },
      amount: p.amount,
    },
    env,
  );
}

export async function getPayout(id: string, env?: Env): Promise<CirclePayout> {
  return call<CirclePayout>("GET", `/v1/businessAccount/payouts/${id}`, undefined, env);
}

export async function listDeposits(env?: Env): Promise<CircleDeposit[]> {
  return call<CircleDeposit[]>("GET", "/v1/businessAccount/deposits", undefined, env);
}

export async function listWireAccounts(env?: Env): Promise<CircleWireAccount[]> {
  return call<CircleWireAccount[]>("GET", "/v1/businessAccount/banks/wires", undefined, env);
}

/** Circle's OWN beneficiary details — where a counterparty would wire money. */
export async function getWireInstructions(
  bankAccountId: string,
  env?: Env,
): Promise<{ trackingRef: string; beneficiaryBank: { accountNumber: string; name?: string } }> {
  return call("GET", `/v1/businessAccount/banks/wires/${bankAccountId}/instructions`, undefined, env);
}

/**
 * SANDBOX ONLY. Simulates the counterparty's bank wiring money in, which is
 * how the two inbound legs (funding, repayment) are exercised.
 *
 * The platform is standing in for someone else's bank here — exactly as the
 * four demo wallets stand in for counterparties on the USDC rail. Every
 * surface that renders an inbound fiat leg must say so.
 *
 * `beneficiaryBank.accountNumber` is CIRCLE'S receiving account from the wire
 * instructions, NOT the account we registered. Passing ours returns a 400 with
 * no field named, at every amount (runbook, step 3).
 */
export async function createMockWire(
  p: { trackingRef: string; beneficiaryAccountNumber: string; amount: CircleAmount; memo?: string },
  env?: Env,
): Promise<{ trackingRef: string; status: string }> {
  return call(
    "POST",
    "/v1/mocks/payments/wire",
    {
      trackingRef: p.trackingRef,
      amount: p.amount,
      beneficiaryBank: { accountNumber: p.beneficiaryAccountNumber },
      ...(p.memo ? { memo: p.memo } : {}),
    },
    env,
  );
}

/**
 * OUR idempotency key is `${legType}:${invoiceId}` — the same string the
 * ledger's unique constraint uses, so the two guards agree by construction.
 * Circle requires a UUID and returns a 422 for anything else, with no field
 * named (found live, 2026-09-15).
 *
 * So it is HASHED, not regenerated. That is the whole point: a retry of the
 * same leg must produce the SAME Circle key, or Circle would treat it as a new
 * instruction and create a second payout. A random UUID per attempt would
 * satisfy the 422 and silently break idempotency where it matters most.
 */
export function circleIdempotencyKey(ledgerKey: string): string {
  const h = createHash("sha256").update(`trade-finance-rails:${ledgerKey}`).digest("hex");
  // Shaped as a v4 UUID: version nibble 4, variant bits 10xx.
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${variant}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join("-");
}

// ── money conversion, in one place ──────────────────────────────────────────

/** The ledger counts cents; Circle speaks decimal strings. */
export function minorToDecimal(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = abs / 100n;
  const cents = abs % 100n;
  return `${neg ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

/** And back — refusing anything the ledger cannot represent exactly. */
export function decimalToMinor(decimal: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(decimal.trim());
  if (!m) {
    throw new RailError(
      "circle-unparsable-amount",
      `Circle returned an amount this ledger cannot read exactly: "${decimal}".`,
    );
  }
  const [, sign, whole, frac = "0"] = m;
  const minor = BigInt(whole) * 100n + BigInt(frac.padEnd(2, "0"));
  return sign === "-" ? -minor : minor;
}

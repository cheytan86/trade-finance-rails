// WEBHOOK SIGNATURE VERIFICATION — and it fails closed, always.
//
// This is the first unauthenticated write path this application has ever had.
// Every other write begins with a person clicking something; this one begins
// with a stranger's HTTP request. Its ONLY credential is the signature, so
// every branch that cannot prove authenticity must refuse.
//
// WHAT CIRCLE ACTUALLY DOES, read from their docs at A5 rather than assumed:
// notifications are signed with an ASYMMETRIC key. The delivery carries
// `X-Circle-Signature` (base64) and `X-Circle-Key-Id` (a UUID), and the public
// key is fetched from Circle by that id. There is NO shared secret — which is
// why `CIRCLE_WEBHOOK_SECRET` was removed from .env.example. It is a better
// posture than a secret we would have to hold and protect.
//
// The signature is over the RAW BODY BYTES. Anything that re-serialises JSON
// before verifying has already lost — key order and whitespace are not
// guaranteed to survive a parse/stringify round trip, so the route reads
// text() first and parses only after the signature holds.

import { createVerify, createPublicKey, verify as cryptoVerify } from "node:crypto";

export class SignatureError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

export const SIGNATURE_HEADER = "x-circle-signature";
export const KEY_ID_HEADER = "x-circle-key-id";

/** The key id the local replay script signs with. Never accepted in production. */
export const LOCAL_REPLAY_KEY_ID = "local-replay";

export interface CirclePublicKey {
  keyId: string;
  /** base64-encoded DER or PEM, as Circle returns it. */
  publicKey: string;
  algorithm: string;
}

export type KeyFetcher = (keyId: string) => Promise<CirclePublicKey | null>;

/**
 * Fetch Circle's public key for a delivery, with a process-lifetime cache.
 * A key id we have never seen triggers exactly one fetch; an unknown id that
 * Circle does not recognise is a refusal, not a retry.
 */
const keyCache = new Map<string, CirclePublicKey>();

export function circleKeyFetcher(
  env: Record<string, string | undefined> = process.env,
): KeyFetcher {
  return async (keyId: string) => {
    // The local replay key exists so the whole asynchronous path is testable
    // offline — Circle cannot reach localhost. It is a DEVELOPMENT affordance
    // and is refused outright in production, where only Circle may sign.
    if (keyId === LOCAL_REPLAY_KEY_ID) {
      if (env.NODE_ENV === "production") return null;
      const pem = env.CIRCLE_WEBHOOK_TEST_PUBLIC_KEY;
      if (!pem) return null;
      return { keyId, publicKey: pem, algorithm: "ECDSA_SHA_256" };
    }

    const cached = keyCache.get(keyId);
    if (cached) return cached;

    const base = env.CIRCLE_API_BASE || "https://api-sandbox.circle.com";
    const apiKey = env.CIRCLE_API_KEY;
    if (!apiKey) return null;

    const res = await fetch(`${base}/v2/notifications/publicKey/${keyId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: CirclePublicKey };
    if (!body.data?.publicKey) return null;
    keyCache.set(keyId, body.data);
    return body.data;
  };
}

/** Header lookup that does not care how the runtime cased them. */
export function headerValue(headers: Headers | Record<string, string>, name: string): string | null {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string>;
  const hit = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
  return hit ? rec[hit] : null;
}

/**
 * Verify a delivery. Returns true ONLY when the signature provably came from
 * the holder of the named key. Every other path returns false:
 *
 *   · no signature header          — a claim, not evidence
 *   · no key id                    — nothing to verify against
 *   · key id unknown to Circle     — refuse rather than retry
 *   · unsupported algorithm        — refuse rather than guess
 *   · malformed key or signature   — refuse
 *   · verification simply fails    — refuse
 *
 * It never throws for an untrusted delivery; refusing IS the answer, and the
 * caller records it. It throws only for a programming error.
 */
export async function verifyCircleSignature(
  headers: Headers | Record<string, string>,
  rawBody: string,
  fetchKey: KeyFetcher,
): Promise<boolean> {
  const signature = headerValue(headers, SIGNATURE_HEADER);
  const keyId = headerValue(headers, KEY_ID_HEADER);
  if (!signature || !keyId) return false;

  let key: CirclePublicKey | null;
  try {
    key = await fetchKey(keyId);
  } catch {
    return false;
  }
  if (!key?.publicKey) return false;

  try {
    const publicKey = createPublicKey(toPem(key.publicKey));
    const sig = Buffer.from(signature, "base64");
    const data = Buffer.from(rawBody, "utf8");

    switch (key.algorithm) {
      case "ECDSA_SHA_256":
        // A DER-encoded ECDSA signature; node verifies it directly.
        return cryptoVerify("sha256", data, publicKey, sig);
      case "RSA_SHA_256": {
        const v = createVerify("RSA-SHA256");
        v.update(data);
        v.end();
        return v.verify(publicKey, sig);
      }
      default:
        // An algorithm we have not reasoned about is not a reason to trust.
        return false;
    }
  } catch {
    return false;
  }
}

/** Circle returns base64 DER or a PEM; accept both, guess neither. */
function toPem(key: string): string {
  const trimmed = key.trim();
  if (trimmed.includes("BEGIN")) return trimmed;
  const wrapped = trimmed.replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;
}

/**
 * SNS delivers Circle Mint's v1 notifications, and its handshake POSTs a
 * `SubscriptionConfirmation` carrying a `SubscribeURL` that must be fetched to
 * complete the subscription.
 *
 * THE SSRF GUARD IS THE POINT. Fetching a URL that arrived in a request body
 * is exactly how a server is turned into someone else's proxy, so the host is
 * checked against Amazon's before anything is fetched. An unsigned or
 * unexpected host is refused and recorded.
 */
export function isTrustedSubscribeUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return /(^|\.)amazonaws\.com$/.test(parsed.hostname);
}

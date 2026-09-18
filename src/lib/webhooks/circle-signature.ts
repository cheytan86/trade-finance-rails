// WEBHOOK SIGNATURE VERIFICATION — and it fails closed, always.
//
// This is the first unauthenticated write path this application has ever had.
// Every other write begins with a person clicking something; this one begins
// with a stranger's HTTP request. Its ONLY credential is the signature, so
// every branch that cannot prove authenticity must refuse.
//
// TWO SCHEMES ARRIVE AT THIS DOOR, and cycle 2 shipped knowing only one.
//
// SCHEME A — header-signed (`X-Circle-Signature` + `X-Circle-Key-Id`), the
// asymmetric scheme read from Circle's docs at A5. The signature is over the
// RAW BODY BYTES, so the route reads text() first and never re-serialises.
// The local replay script signs this way, which is why the whole asynchronous
// path was testable offline.
//
// SCHEME B — SNS-signed, and this is what Circle Mint ACTUALLY DELIVERS.
// Found at Deploy, 2026-09-18, the first time this app was somewhere Circle
// could reach: every real notification arrives as an Amazon SNS envelope, and
// the HTTP request is made by SNS rather than by Circle. There is no
// `X-Circle-Signature` header on it at all. SNS signs a CANONICAL STRING built
// from named fields of the parsed body, with an RSA key whose X.509
// certificate is fetched from `SigningCertURL`.
//
// So scheme B cannot verify raw bytes — the signature is not over them. It is
// over a reconstruction, which means the body must be parsed BEFORE it can be
// verified. That inverts scheme A's rule and is not a weakening of it: what
// matters is that nothing is ACTED ON until verification holds, and both
// schemes still refuse before any meaning is taken from the message. A2's rule
// survives intact — the body is a doorbell, never evidence.
//
// There is NO shared secret in either scheme, which is why
// `CIRCLE_WEBHOOK_SECRET` was removed from .env.example.

import {
  createVerify,
  createPublicKey,
  verify as cryptoVerify,
  X509Certificate,
} from "node:crypto";

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
  return isTrustedAmazonUrl(url);
}

/** HTTPS, and a host Amazon owns. Used for both the SubscribeURL we fetch and
 *  the SigningCertURL we fetch — the same reasoning applies to both, because
 *  both are URLs that arrived inside a request body. */
export function isTrustedAmazonUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return /(^|\.)amazonaws\.com$/.test(parsed.hostname);
}

// ── scheme B: SNS ───────────────────────────────────────────────────────────

/** The fields SNS signs, in the order it signs them. Type decides the set. */
const SNS_SIGNED_FIELDS: Record<string, readonly string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: [
    "Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type",
  ],
  UnsubscribeConfirmation: [
    "Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type",
  ],
};

/**
 * Rebuild exactly what SNS signed: `name\nvalue\n` per field, in order.
 * `Subject` is the only optional one — present or absent, never empty-filled.
 * A missing required field means we cannot reconstruct what was signed, and
 * guessing is not verification, so it returns null and the caller refuses.
 */
export function snsCanonicalString(body: Record<string, unknown>): string | null {
  const type = typeof body.Type === "string" ? body.Type : null;
  const fields = type ? SNS_SIGNED_FIELDS[type] : null;
  if (!fields) return null;

  let canonical = "";
  for (const field of fields) {
    const value = body[field];
    if (value === undefined || value === null) {
      if (field === "Subject") continue;
      return null;
    }
    canonical += `${field}\n${String(value)}\n`;
  }
  return canonical;
}

const certCache = new Map<string, string>();

/**
 * Verify an SNS envelope against the certificate SNS names — after checking
 * that the certificate lives on a host Amazon owns. Fetching a URL that
 * arrived in a request body is how a server becomes someone else's proxy, and
 * a certificate URL is no more trustworthy than a SubscribeURL.
 */
export async function verifySnsSignature(
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const signature = typeof body.Signature === "string" ? body.Signature : null;
  const certUrl =
    typeof body.SigningCertURL === "string"
      ? body.SigningCertURL
      : typeof body.SigningCertUrl === "string"
        ? body.SigningCertUrl
        : null;
  if (!signature || !certUrl) return false;
  if (!isTrustedAmazonUrl(certUrl)) return false;

  // SignatureVersion 1 is SHA1, 2 is SHA256. A version we have not reasoned
  // about is refused rather than guessed at.
  const version = String(body.SignatureVersion ?? "");
  const algorithm = version === "1" ? "RSA-SHA1" : version === "2" ? "RSA-SHA256" : null;
  if (!algorithm) return false;

  const canonical = snsCanonicalString(body);
  if (canonical === null) return false;

  try {
    let pem = certCache.get(certUrl);
    if (!pem) {
      const res = await fetchImpl(certUrl);
      if (!res.ok) return false;
      pem = await res.text();
      certCache.set(certUrl, pem);
    }
    const publicKey = new X509Certificate(pem).publicKey;
    const verifier = createVerify(algorithm);
    verifier.update(canonical, "utf8");
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export interface DeliveryVerdict {
  valid: boolean;
  scheme: "circle-header" | "sns" | null;
  /** Parsed only when scheme B needed it; the route re-parses otherwise. */
  body: Record<string, unknown> | null;
}

/**
 * ONE DOOR, TWO SCHEMES, and the scheme is chosen by what the delivery
 * carries — never by what we hope it is. A delivery that matches neither is
 * refused, which is the same answer an unsigned one gets.
 */
export async function verifyDelivery(
  headers: Headers | Record<string, string>,
  rawBody: string,
  fetchKey: KeyFetcher = circleKeyFetcher(),
): Promise<DeliveryVerdict> {
  if (headerValue(headers, SIGNATURE_HEADER) && headerValue(headers, KEY_ID_HEADER)) {
    return {
      valid: await verifyCircleSignature(headers, rawBody, fetchKey),
      scheme: "circle-header",
      body: null,
    };
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { valid: false, scheme: null, body: null };
  }
  if (body && typeof body === "object" && typeof body.Signature === "string") {
    return { valid: await verifySnsSignature(body), scheme: "sns", body };
  }
  return { valid: false, scheme: null, body };
}

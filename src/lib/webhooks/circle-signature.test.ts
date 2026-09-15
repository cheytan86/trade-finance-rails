// The security core of cycle 2, and the only module in this product whose job
// is to say NO to strangers. Every test here is a refusal except two.

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  verifyCircleSignature,
  isTrustedSubscribeUrl,
  circleKeyFetcher,
  LOCAL_REPLAY_KEY_ID,
  headerValue,
  type KeyFetcher,
} from "./circle-signature";

// A real EC keypair, so the verifier runs its real code path rather than a stub.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();

const BODY = JSON.stringify({ Type: "Notification", Message: "{}" });

function signed(body: string): string {
  return cryptoSign("sha256", Buffer.from(body, "utf8"), privateKey).toString("base64");
}

const goodKey: KeyFetcher = async (keyId) => ({
  keyId,
  publicKey: publicPem,
  algorithm: "ECDSA_SHA_256",
});

const headers = (sig: string | null, keyId: string | null = "key-1") => {
  const h = new Headers();
  if (sig) h.set("X-Circle-Signature", sig);
  if (keyId) h.set("X-Circle-Key-Id", keyId);
  return h;
};

describe("a delivery is trusted only when it proves itself", () => {
  it("accepts a correctly signed body", async () => {
    expect(await verifyCircleSignature(headers(signed(BODY)), BODY, goodKey)).toBe(true);
  });

  it("accepts headers whatever their casing", async () => {
    const h = { "x-circle-signature": signed(BODY), "X-CIRCLE-KEY-ID": "key-1" };
    expect(await verifyCircleSignature(h, BODY, goodKey)).toBe(true);
    expect(headerValue(h, "X-Circle-Signature")).toBeTruthy();
  });

  it("REFUSES a body that changed after signing — one byte is enough", async () => {
    const sig = signed(BODY);
    const tampered = JSON.stringify({ Type: "Notification", Message: "{}", extra: 1 });
    expect(await verifyCircleSignature(headers(sig), tampered, goodKey)).toBe(false);
  });

  it("REFUSES a missing signature — an unsigned callback is a claim, not evidence", async () => {
    expect(await verifyCircleSignature(headers(null), BODY, goodKey)).toBe(false);
  });

  it("REFUSES a missing key id — there is nothing to verify against", async () => {
    expect(await verifyCircleSignature(headers(signed(BODY), null), BODY, goodKey)).toBe(false);
  });

  it("REFUSES a key id Circle does not recognise", async () => {
    const unknown: KeyFetcher = async () => null;
    expect(await verifyCircleSignature(headers(signed(BODY)), BODY, unknown)).toBe(false);
  });

  it("REFUSES an algorithm it has not reasoned about, rather than guessing", async () => {
    const odd: KeyFetcher = async (keyId) => ({
      keyId,
      publicKey: publicPem,
      algorithm: "SOMETHING_NEW",
    });
    expect(await verifyCircleSignature(headers(signed(BODY)), BODY, odd)).toBe(false);
  });

  it("REFUSES a signature made by a DIFFERENT key", async () => {
    const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const forged = cryptoSign("sha256", Buffer.from(BODY, "utf8"), other.privateKey).toString("base64");
    expect(await verifyCircleSignature(headers(forged), BODY, goodKey)).toBe(false);
  });

  it("REFUSES garbage in the signature header without throwing", async () => {
    expect(await verifyCircleSignature(headers("not-base64-!!"), BODY, goodKey)).toBe(false);
  });

  it("REFUSES when the key fetch itself throws — a network failure is not trust", async () => {
    const broken: KeyFetcher = async () => {
      throw new Error("circle unreachable");
    };
    expect(await verifyCircleSignature(headers(signed(BODY)), BODY, broken)).toBe(false);
  });
});

describe("the local replay key is a development affordance, and knows it", () => {
  it("is honoured outside production, so the async path is testable offline", async () => {
    const fetchKey = circleKeyFetcher({
      NODE_ENV: "development",
      CIRCLE_WEBHOOK_TEST_PUBLIC_KEY: publicPem,
    });
    const key = await fetchKey(LOCAL_REPLAY_KEY_ID);
    expect(key?.publicKey).toBe(publicPem);
  });

  it("is REFUSED in production, even with the variable set", async () => {
    // Otherwise anyone who could set an env var could forge settlements.
    const fetchKey = circleKeyFetcher({
      NODE_ENV: "production",
      CIRCLE_WEBHOOK_TEST_PUBLIC_KEY: publicPem,
    });
    expect(await fetchKey(LOCAL_REPLAY_KEY_ID)).toBeNull();
  });

  it("is absent when the variable is not set", async () => {
    const fetchKey = circleKeyFetcher({ NODE_ENV: "development" });
    expect(await fetchKey(LOCAL_REPLAY_KEY_ID)).toBeNull();
  });
});

describe("the SNS handshake cannot be used to make us fetch anything", () => {
  it("accepts Amazon's own confirmation URLs", () => {
    expect(isTrustedSubscribeUrl("https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription")).toBe(true);
  });

  it("REFUSES a URL on any other host — the SSRF guard", () => {
    // A SubscribeURL arrives inside a request body. Fetching it unchecked is
    // how a server becomes someone else's proxy.
    expect(isTrustedSubscribeUrl("https://evil.example.com/confirm")).toBe(false);
    expect(isTrustedSubscribeUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("REFUSES a lookalike host", () => {
    expect(isTrustedSubscribeUrl("https://amazonaws.com.evil.test/x")).toBe(false);
    expect(isTrustedSubscribeUrl("https://notamazonaws.com/x")).toBe(false);
  });

  it("REFUSES plain http, and anything unparseable", () => {
    expect(isTrustedSubscribeUrl("http://sns.us-east-1.amazonaws.com/x")).toBe(false);
    expect(isTrustedSubscribeUrl("not a url")).toBe(false);
  });
});

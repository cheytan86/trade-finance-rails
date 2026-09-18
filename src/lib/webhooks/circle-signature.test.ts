// The security core of cycle 2, and the only module in this product whose job
// is to say NO to strangers. Every test here is a refusal except two.

import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import {
  verifyCircleSignature,
  isTrustedSubscribeUrl,
  isTrustedAmazonUrl,
  circleKeyFetcher,
  LOCAL_REPLAY_KEY_ID,
  headerValue,
  snsCanonicalString,
  verifySnsSignature,
  verifyDelivery,
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


// ── SCHEME B — SNS ──────────────────────────────────────────────────────────
//
// Found at Deploy, 2026-09-18: Circle Mint delivers through Amazon SNS, so the
// request is made by SNS and carries NO X-Circle-Signature header at all. The
// header scheme this module shipped with could never have accepted a real
// notification. These tests pin the scheme that actually arrives.

describe("the SNS canonical string — rebuilding exactly what was signed", () => {
  const notification = {
    Type: "Notification",
    MessageId: "m-1",
    Message: "{}",
    Timestamp: "2026-09-18T09:50:12.000Z",
    TopicArn: "arn:aws:sns:us-east-1:1:topic",
    Signature: "x",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
  };

  it("uses SNS's field order, not the body's key order", () => {
    // The body above lists Type first; SNS signs Message first. Getting this
    // wrong verifies nothing and looks like a bad signature.
    expect(snsCanonicalString(notification)).toBe(
      "Message\n{}\n" +
        "MessageId\nm-1\n" +
        "Timestamp\n2026-09-18T09:50:12.000Z\n" +
        "TopicArn\narn:aws:sns:us-east-1:1:topic\n" +
        "Type\nNotification\n",
    );
  });

  it("includes Subject only when it is present", () => {
    expect(snsCanonicalString({ ...notification, Subject: "hi" })).toContain("Subject\nhi\n");
    expect(snsCanonicalString(notification)).not.toContain("Subject");
  });

  it("signs the handshake's own fields, which are a different set", () => {
    const canon = snsCanonicalString({
      Type: "SubscriptionConfirmation",
      MessageId: "m-2",
      Message: "confirm me",
      SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=Confirm",
      Timestamp: "2026-09-18T09:37:21.000Z",
      Token: "tok",
      TopicArn: "arn:aws:sns:us-east-1:1:topic",
    });
    expect(canon).toContain("SubscribeURL\n");
    expect(canon).toContain("Token\ntok\n");
  });

  it("REFUSES to guess when a signed field is missing", () => {
    const { Timestamp: _dropped, ...missing } = notification;
    expect(snsCanonicalString(missing)).toBeNull();
  });

  it("refuses a message type it has not reasoned about", () => {
    expect(snsCanonicalString({ ...notification, Type: "SomethingNew" })).toBeNull();
  });
});

describe("the SNS verifier refuses before it fetches anything", () => {
  const base = {
    Type: "Notification",
    MessageId: "m-1",
    Message: "{}",
    Timestamp: "2026-09-18T09:50:12.000Z",
    TopicArn: "arn:aws:sns:us-east-1:1:topic",
    SignatureVersion: "1",
    Signature: "AAAA",
  };
  /** Fails the test if the verifier fetches when it should have refused. */
  const noFetch = (() => {
    throw new Error("fetched a certificate it should have refused");
  }) as unknown as typeof fetch;

  it("refuses a certificate URL on a host Amazon does not own", async () => {
    // The whole SSRF argument, applied to the cert URL as well as SubscribeURL:
    // both are URLs that arrived inside a request body.
    await expect(
      verifySnsSignature(
        { ...base, SigningCertURL: "https://sns.us-east-1.amazonaws.com.evil.example/c.pem" },
        noFetch,
      ),
    ).resolves.toBe(false);
  });

  it("refuses plain HTTP even on an Amazon host", async () => {
    await expect(
      verifySnsSignature({ ...base, SigningCertURL: "http://sns.us-east-1.amazonaws.com/c.pem" }, noFetch),
    ).resolves.toBe(false);
  });

  it("refuses a signature version it has not reasoned about", async () => {
    await expect(
      verifySnsSignature(
        { ...base, SignatureVersion: "9", SigningCertURL: "https://sns.us-east-1.amazonaws.com/c.pem" },
        noFetch,
      ),
    ).resolves.toBe(false);
  });

  it("refuses when there is no signature at all", async () => {
    const { Signature: _none, ...unsigned } = base;
    await expect(
      verifySnsSignature({ ...unsigned, SigningCertURL: "https://sns.us-east-1.amazonaws.com/c.pem" }, noFetch),
    ).resolves.toBe(false);
  });

  it("guards the cert URL with the same rule as the SubscribeURL", () => {
    expect(isTrustedAmazonUrl("https://sns.us-east-1.amazonaws.com/c.pem")).toBe(true);
    expect(isTrustedSubscribeUrl("https://sns.us-east-1.amazonaws.com/c.pem")).toBe(true);
    expect(isTrustedAmazonUrl("https://amazonaws.com.evil.example/c.pem")).toBe(false);
  });
});

describe("one door, two schemes, chosen by what the delivery carries", () => {
  const snsBody = JSON.stringify({
    Type: "Notification",
    MessageId: "m",
    Message: "{}",
    Timestamp: "t",
    TopicArn: "a",
    SignatureVersion: "1",
    Signature: "AAAA",
    SigningCertURL: "https://evil.example/c.pem",
  });

  it("picks the SNS scheme when there are no Circle headers", async () => {
    const v = await verifyDelivery({}, snsBody, (async () => null) as KeyFetcher);
    expect(v.scheme).toBe("sns");
    // and still refuses, because that cert URL is not Amazon's
    expect(v.valid).toBe(false);
  });

  it("picks the header scheme when the headers are there", async () => {
    const v = await verifyDelivery(
      { "x-circle-signature": "AAAA", "x-circle-key-id": "k" },
      snsBody,
      (async () => null) as KeyFetcher,
    );
    expect(v.scheme).toBe("circle-header");
    expect(v.valid).toBe(false);
  });

  it("refuses a delivery that carries neither", async () => {
    const v = await verifyDelivery({}, JSON.stringify({ hello: "world" }), (async () => null) as KeyFetcher);
    expect(v.valid).toBe(false);
    expect(v.scheme).toBeNull();
  });

  it("refuses an unparseable body without throwing", async () => {
    const v = await verifyDelivery({}, "not json", (async () => null) as KeyFetcher);
    expect(v.valid).toBe(false);
  });
});

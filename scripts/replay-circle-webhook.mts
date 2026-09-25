// A SIGNED WEBHOOK DELIVERY, POSTED TO LOCALHOST.
//
// Circle cannot reach a development machine, so without this the entire
// asynchronous path — signature check, matching, unattended booking — would
// only ever be exercisable on a deployed preview, one push per iteration.
// Chetan chose this over a tunnel (2026-09-15): no third-party account, no URL
// that changes between sessions, and it runs in CI.
//
// It signs with a LOCALLY GENERATED key under the key id `local-replay`, which
// src/lib/webhooks/circle-signature.ts refuses outright when NODE_ENV is
// production. The real Circle path is unchanged and unweakened; this adds a
// second key that only exists off-production.
//
//   node scripts/replay-circle-webhook.mts --init
//       generate a keypair, print the public key to add to .env.local
//
//   node scripts/replay-circle-webhook.mts --payout <circle-payout-id>
//       deliver a notification for one payout, as Circle would
//
//   node scripts/replay-circle-webhook.mts --deposit
//       deliver a deposit notification, which re-checks open inbound legs
//
//   node scripts/replay-circle-webhook.mts --forge
//       deliver a body whose signature does not match it — MUST be refused

import { generateKeyPairSync, sign as cryptoSign, createPrivateKey } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const KEY_FILE = ".replay-key.pem"; // gitignored; a throwaway, never a credential
const ENDPOINT = process.env.REPLAY_ENDPOINT ?? "http://localhost:3900/api/webhooks/circle";

const args = process.argv.slice(2);
const has = (f: string) => args.includes(f);
const valueOf = (f: string) => args[args.indexOf(f) + 1];

if (has("--init")) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  writeFileSync(KEY_FILE, privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
  console.log("Wrote", KEY_FILE, "(gitignored — a throwaway, not a credential)\n");
  console.log("Add this to .env.local, as one line:\n");
  console.log(`CIRCLE_WEBHOOK_TEST_PUBLIC_KEY="${pub.replace(/\n/g, "\\n")}"`);
  process.exit(0);
}

if (!existsSync(KEY_FILE)) {
  console.error(`No ${KEY_FILE}. Run:  node scripts/replay-circle-webhook.mts --init`);
  process.exit(1);
}
const privateKey = createPrivateKey(readFileSync(KEY_FILE, "utf8"));

function snsEnvelope(message: unknown) {
  return JSON.stringify({
    Type: "Notification",
    MessageId: crypto.randomUUID(),
    Timestamp: new Date().toISOString(),
    Message: JSON.stringify(message),
  });
}

let body: string;
if (has("--payout")) {
  const id = valueOf("--payout");
  if (!id) { console.error("--payout needs a Circle payout id"); process.exit(1); }
  body = snsEnvelope({ notificationType: "payouts", payout: { id } });
} else if (has("--deposit")) {
  body = snsEnvelope({ notificationType: "payments", deposit: { id: crypto.randomUUID() } });
} else {
  body = snsEnvelope({ notificationType: "payouts", payout: { id: crypto.randomUUID() } });
}

// The forgery signs a DIFFERENT body than the one it sends, which is exactly
// what a tampered delivery looks like on the wire.
const signedOver = has("--forge") ? snsEnvelope({ notificationType: "payouts", payout: { id: "other" } }) : body;
const signature = cryptoSign("sha256", Buffer.from(signedOver, "utf8"), privateKey).toString("base64");

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Circle-Signature": signature,
    "X-Circle-Key-Id": "local-replay",
  },
  body,
});

console.log(`${has("--forge") ? "FORGED " : ""}POST ${ENDPOINT}`);
console.log(`  -> ${res.status} ${await res.text()}`);
if (has("--forge") && res.status === 200) {
  console.error("\n  FAIL: a forged delivery was accepted.");
  process.exit(1);
}

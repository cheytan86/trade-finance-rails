// The demo wallet registry — repo-managed, faucet-funded, labelled
// (discovery decision 2026-09-07). Four actors, four wallets.
//
// THE RULES (AGENTS block, design §7): private keys live in .env.local ONLY —
// never in this file, the database, git, client code, or any log. This module
// resolves an actor to a viem account by reading the env var whose NAME is
// registered here, at call time, server-side. Everything is testnet; these
// wallets custody worthless tokens and every surface that shows them says so.

import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

export const WALLET_ACTORS = ["funder", "platform", "supplier", "debtor"] as const;
export type WalletActor = (typeof WALLET_ACTORS)[number];

const ENV_KEYS: Record<WalletActor, string> = {
  funder: "WALLET_FUNDER_PK",
  platform: "WALLET_PLATFORM_PK",
  supplier: "WALLET_SUPPLIER_PK",
  debtor: "WALLET_DEBTOR_PK",
};

export class WalletError extends Error {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.rule = rule;
  }
}

const PK_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Resolve a demo actor's signing account. `env` is injectable for tests;
 * production callers use process.env at request time.
 */
export function demoWallet(
  actor: WalletActor,
  env: Record<string, string | undefined> = process.env,
): PrivateKeyAccount {
  const key = env[ENV_KEYS[actor]];
  if (!key) {
    throw new WalletError(
      "wallet-unconfigured",
      `The ${actor} demo wallet is not configured — ${ENV_KEYS[actor]} is missing from .env.local (see .env.example and the faucet runbook).`,
    );
  }
  if (!PK_RE.test(key)) {
    throw new WalletError(
      "wallet-malformed-key",
      `${ENV_KEYS[actor]} is not a valid private key (expected 0x + 64 hex chars). The value is never logged.`,
    );
  }
  return privateKeyToAccount(key as `0x${string}`);
}

/** Address for display — derived, never stored, safe to render. */
export function demoWalletAddress(
  actor: WalletActor,
  env: Record<string, string | undefined> = process.env,
): `0x${string}` {
  return demoWallet(actor, env).address;
}

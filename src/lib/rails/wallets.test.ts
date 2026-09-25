import { describe, it, expect } from "vitest";
import { demoWallet, demoWalletAddress, WalletError } from "./wallets";

// A well-known test vector key (publicly documented, never funded) — fine to
// appear in a test, unlike any real wallet key.
const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("demoWallet — keys are claims from the environment", () => {
  it("derives the account from a configured key", () => {
    const env = { WALLET_FUNDER_PK: TEST_PK };
    expect(demoWallet("funder", env).address).toBe(TEST_ADDR);
    expect(demoWalletAddress("funder", env)).toBe(TEST_ADDR);
  });
  it("a missing key names the actor, the env var and the runbook — never a crash", () => {
    try {
      demoWallet("debtor", {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(WalletError);
      expect((e as WalletError).rule).toBe("wallet-unconfigured");
      expect((e as WalletError).message).toContain("WALLET_DEBTOR_PK");
      expect((e as WalletError).message).toContain("runbook");
    }
  });
  it("a malformed key is refused without echoing the value", () => {
    const env = { WALLET_PLATFORM_PK: "not-a-key-secret-value" };
    try {
      demoWallet("platform", env);
      expect.unreachable();
    } catch (e) {
      expect((e as WalletError).rule).toBe("wallet-malformed-key");
      expect((e as WalletError).message).not.toContain("secret-value");
    }
  });
});

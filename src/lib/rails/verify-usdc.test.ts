import { describe, it, expect } from "vitest";
import { encodeEventTopics, encodeAbiParameters, erc20Abi } from "viem";
import { verifyUsdcTransfer, assertTestnet, BASE_SEPOLIA, type ReceiptLike } from "./verify-usdc";
import { RailError } from "./types";

// Fixture builder: a real ERC-20 Transfer log, encoded the way the chain
// encodes them — so these tests exercise the actual decoder, not a stub.
const TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
const A = "0x0F2892a05cB0489b2356f71584e29987D25f49d9";
const B = "0x10e5B730Dc2a02944372C1a8d64d76514F9D3352";
const C = "0xF05B371805eA97bFBC74e2254089B3c2C9aA8D79";

type LogLike = ReceiptLike["logs"][number];

function transferLog(token: string, from: string, to: string, value: bigint): LogLike {
  return {
    address: token as `0x${string}`,
    topics: encodeEventTopics({
      abi: erc20Abi,
      eventName: "Transfer",
      args: { from: from as `0x${string}`, to: to as `0x${string}` },
    }) as LogLike["topics"],
    data: encodeAbiParameters([{ type: "uint256" }], [value]),
  };
}

const receipt = (logs: LogLike[], over: Partial<ReceiptLike> = {}): ReceiptLike => ({
  status: "success",
  chainId: BASE_SEPOLIA,
  logs,
  ...over,
});

const params = (r: ReceiptLike, over = {}) => ({
  receipt: r,
  expectedChainId: BASE_SEPOLIA,
  expectedToken: TOKEN,
  expectedFrom: A,
  expectedTo: B,
  expectedAmount: 10_000_000n, // 10 USDC at 6dp
  ...over,
});

describe("the happy path", () => {
  it("verifies a clean single transfer", () => {
    const r = receipt([transferLog(TOKEN, A, B, 10_000_000n)]);
    expect(verifyUsdcTransfer(params(r))).toEqual({ amount: 10_000_000n, transfers: 1 });
  });
});

describe("DEFECT 2 — every matching log is summed, not just the first", () => {
  it("sums two transfers between the same parties in one transaction", () => {
    // The sibling verifier would have seen 4 USDC and passed a 10 USDC claim
    // only by accident, or failed a legitimate split payment.
    const r = receipt([
      transferLog(TOKEN, A, B, 4_000_000n),
      transferLog(TOKEN, A, B, 6_000_000n),
    ]);
    expect(verifyUsdcTransfer(params(r))).toEqual({ amount: 10_000_000n, transfers: 2 });
  });

  it("ignores transfers to other parties in the same transaction", () => {
    const r = receipt([
      transferLog(TOKEN, A, C, 99_000_000n), // someone else's leg
      transferLog(TOKEN, A, B, 10_000_000n),
    ]);
    expect(verifyUsdcTransfer(params(r)).amount).toBe(10_000_000n);
  });

  it("refuses when the FIRST log matches but the total does not", () => {
    // Exactly the shape the old first-log-only defect got wrong.
    const r = receipt([
      transferLog(TOKEN, A, B, 10_000_000n),
      transferLog(TOKEN, A, B, 1n),
    ]);
    expect(() => verifyUsdcTransfer(params(r))).toThrowError(/requires exactly/);
  });
});

describe("DEFECT 1 — chain identity is explicit, and mainnet is refused", () => {
  it("refuses a receipt from a different chain", () => {
    const r = receipt([transferLog(TOKEN, A, B, 10_000_000n)], { chainId: 11155111 });
    try {
      verifyUsdcTransfer(params(r));
      expect.unreachable();
    } catch (e) {
      expect((e as RailError).rule).toBe("rail-wrong-chain");
      expect((e as RailError).message).toMatch(/proves nothing here/);
    }
  });

  it("refuses mainnet outright — as expectation and as receipt", () => {
    const r = receipt([transferLog(TOKEN, A, B, 10_000_000n)], { chainId: 8453 });
    expect(() => verifyUsdcTransfer(params(r, { expectedChainId: 8453 }))).toThrowError(
      /never touches mainnet/,
    );
    expect(() => verifyUsdcTransfer(params(r))).toThrowError(/never touches mainnet/);
    for (const id of [1, 8453, 10, 137, 42161]) {
      expect(() => assertTestnet(id), `chain ${id}`).toThrowError(RailError);
    }
    expect(() => assertTestnet(BASE_SEPOLIA)).not.toThrow();
  });
});

describe("the rest of the refusal catalogue", () => {
  it("refuses a reverted transaction", () => {
    const r = receipt([transferLog(TOKEN, A, B, 10_000_000n)], { status: "reverted" });
    expect(() => verifyUsdcTransfer(params(r))).toThrowError(/did not succeed/);
  });

  it("refuses the wrong token contract", () => {
    const other = "0x1111111111111111111111111111111111111111";
    const r = receipt([transferLog(other, A, B, 10_000_000n)]);
    expect(() => verifyUsdcTransfer(params(r))).toThrowError(/No transfer of the expected token/);
  });

  it("refuses the wrong recipient, and says the token moved elsewhere", () => {
    const r = receipt([transferLog(TOKEN, A, C, 10_000_000n)]);
    try {
      verifyUsdcTransfer(params(r));
      expect.unreachable();
    } catch (e) {
      expect((e as RailError).rule).toBe("rail-wrong-parties");
      expect((e as RailError).message).toMatch(/but not from/);
    }
  });

  it("refuses the wrong sender", () => {
    const r = receipt([transferLog(TOKEN, C, B, 10_000_000n)]);
    expect(() => verifyUsdcTransfer(params(r))).toThrowError(/rail|matching transfer|not from/i);
  });

  it("refuses a short payment and a long one, naming both numbers", () => {
    const short = receipt([transferLog(TOKEN, A, B, 9_999_999n)]);
    expect(() => verifyUsdcTransfer(params(short))).toThrowError(/9999999.*10000000/s);
    const long = receipt([transferLog(TOKEN, A, B, 10_000_001n)]);
    expect(() => verifyUsdcTransfer(params(long))).toThrowError(/requires exactly/);
  });

  it("ignores non-Transfer logs from the token without crashing", () => {
    const noise = { address: TOKEN as `0x${string}`, topics: ["0xdead"] as [`0x${string}`], data: "0x" as `0x${string}` };
    const r = receipt([noise, transferLog(TOKEN, A, B, 10_000_000n)]);
    expect(verifyUsdcTransfer(params(r)).amount).toBe(10_000_000n);
  });
});

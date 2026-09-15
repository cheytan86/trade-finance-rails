// THE VERIFIER — re-derives a transfer from the chain itself, never trusting
// what anyone claims happened. Ported from the sibling repo
// (receivables-financing-mvp/src/lib/web3/verify.ts) with its three recorded
// defects fixed at the door:
//
//   1. Chain identity was hard-coded from a wagmi import while the env var
//      was declared and never read. HERE: the expected chain id is a required
//      parameter of every call, and a receipt from another chain is a
//      REFUSAL — including mainnet, which can never be accepted at all.
//   2. It matched the FIRST log with the token address. HERE: every matching
//      Transfer log is decoded and the ones between the expected parties are
//      SUMMED — a transaction carrying several transfers is fully accounted.
//   3. Amounts went through float `toFixed`. HERE: bigint end to end.
//
// Pure and framework-free: it takes a receipt-shaped object, so fixtures test
// every refusal without a network.

import { decodeEventLog, erc20Abi, type Log } from "viem";
import { RailError } from "./types.ts";

/** Chain ids this project may ever verify against. Mainnet is absent on
 *  purpose — see assertTestnet. */
export const BASE_SEPOLIA = 84532;
const MAINNET_IDS = new Set([1, 8453, 10, 137, 42161]);

export interface ReceiptLike {
  status: "success" | "reverted";
  logs: Array<Pick<Log, "address" | "topics" | "data">>;
  /** The chain the receipt was actually fetched from. */
  chainId: number;
}

export interface VerifyParams {
  receipt: ReceiptLike;
  expectedChainId: number;
  expectedToken: string;
  expectedFrom: string;
  expectedTo: string;
  /** In the token's own units (6dp for USDC), not cents. */
  expectedAmount: bigint;
}

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A mainnet chain id is never a configuration mistake to tolerate — it is a
 *  refusal, everywhere, always (AGENTS block). */
export function assertTestnet(chainId: number): void {
  if (MAINNET_IDS.has(chainId)) {
    throw new RailError(
      "rail-mainnet-refused",
      `Chain ${chainId} is a mainnet. This demonstration never touches mainnet.`,
    );
  }
}

export function verifyUsdcTransfer(p: VerifyParams): { amount: bigint; transfers: number } {
  assertTestnet(p.expectedChainId);
  assertTestnet(p.receipt.chainId);

  if (p.receipt.chainId !== p.expectedChainId) {
    throw new RailError(
      "rail-wrong-chain",
      `This transaction is from chain ${p.receipt.chainId}, not ${p.expectedChainId}. A valid hash on the wrong chain proves nothing here.`,
    );
  }
  if (p.receipt.status !== "success") {
    throw new RailError("rail-tx-reverted", "The transaction did not succeed on-chain.");
  }

  const tokenLogs = p.receipt.logs.filter((l) => eq(l.address, p.expectedToken));
  if (tokenLogs.length === 0) {
    throw new RailError(
      "rail-wrong-token",
      "No transfer of the expected token appears in this transaction.",
    );
  }

  // DEFECT 2 FIXED: sum every matching transfer, don't take the first log.
  let total = 0n;
  let matched = 0;
  let sawOtherRecipient = false;
  for (const log of tokenLogs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    } catch {
      continue; // not a Transfer (an Approval, say) — ignore it
    }
    if (decoded.eventName !== "Transfer") continue;
    const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
    if (eq(from, p.expectedFrom) && eq(to, p.expectedTo)) {
      total += value;
      matched += 1;
    } else {
      sawOtherRecipient = true;
    }
  }

  if (matched === 0) {
    throw new RailError(
      "rail-wrong-parties",
      sawOtherRecipient
        ? `This transaction moves the token, but not from ${p.expectedFrom} to ${p.expectedTo}.`
        : "No matching transfer between the expected parties.",
    );
  }
  if (total !== p.expectedAmount) {
    throw new RailError(
      "rail-wrong-amount",
      `Transferred ${total} of the token; this movement requires exactly ${p.expectedAmount}.`,
    );
  }

  return { amount: total, transfers: matched };
}

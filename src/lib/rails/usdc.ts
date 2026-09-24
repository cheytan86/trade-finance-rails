// The USDC rail on Base Sepolia. Real testnet transfers between the four
// repo-managed demo wallets (docs/demo-wallets-runbook.md), verified by
// re-derivation before anything books.
//
// Custody posture, stated plainly wherever this rail is shown: these wallets
// are platform-held and the demonstration is deliberately not
// bankruptcy-remote (paper §10 Q18). The tokens are worthless testnet USDC.

import { createPublicClient, createWalletClient, http, erc20Abi, type PublicClient } from "viem";
import { baseSepolia } from "viem/chains";
import {
  RailError,
  type SettlementRail,
  type TransferPreview,
  type TransferReceipt,
  type TransferRequest,
  type InboundListing,
  type VerifyOutcome,
} from "./types.ts";
import { demoWallet, demoWalletAddress, type WalletActor } from "./wallets.ts";
import { verifyUsdcTransfer, BASE_SEPOLIA, assertTestnet } from "./verify-usdc.ts";

/** Base Sepolia USDC — a public fact, mirrored from .env.example. */
export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined) ??
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const EXPLORER = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.basescan.org";

/** The ledger counts cents (2dp); USDC has 6dp. One conversion, one place. */
const CENTS_TO_USDC = 10_000n;
export const centsToTokenUnits = (cents: bigint) => cents * CENTS_TO_USDC;
export const tokenUnitsToCents = (units: bigint) => {
  if (units % CENTS_TO_USDC !== 0n) {
    throw new RailError(
      "rail-subcent-amount",
      `On-chain amount ${units} is not a whole number of cents; the ledger cannot represent it.`,
    );
  }
  return units / CENTS_TO_USDC;
};

function publicClient(): PublicClient {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  }) as PublicClient;
}

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export const usdcRail: SettlementRail = {
  id: "usdc",
  label: "USDC on Base Sepolia (testnet)",
  // Broadcast is instant; confirmation is not. A block usually lands in
  // seconds, so most legs settle in the same request — but never by waiting.
  settlement: "immediate",

  // Cycle 4. Both are real and both have been met: cycle 1 hit an RPC
  // read-after-write lag that refused a legitimate disbursement, and
  // verify-usdc.ts books nothing it cannot re-derive from the chain.
  failureModes:
    "A transfer that cannot be re-derived from the chain books nothing, and a node that has not caught up looks the same as one that has nothing to report.",
  // A transaction hash. Anyone can open it on Basescan, today or in ten
  // years, without asking us or Circle for anything.
  verifiability: "public",

  async prepare(req: TransferRequest): Promise<TransferPreview> {
    const from = demoWalletAddress(req.from as WalletActor);
    const to = demoWalletAddress(req.to as WalletActor);
    return {
      rail: "usdc",
      amountMinor: req.amountMinor,
      fromLabel: `${req.from} demo wallet ${shortAddr(from)}`,
      toLabel: `${req.to} demo wallet ${shortAddr(to)}`,
      onChain: true,
      note: "Sends real testnet USDC on Base Sepolia. Confirmation takes a few seconds; nothing books until the transfer is verified on-chain.",
    };
  },

  async execute(req: TransferRequest): Promise<TransferReceipt> {
    assertTestnet(BASE_SEPOLIA);
    if (req.amountMinor <= 0n) {
      throw new RailError("rail-nonpositive-amount", "A transfer must move a positive amount.");
    }
    const account = demoWallet(req.from as WalletActor);
    const to = demoWalletAddress(req.to as WalletActor);
    const value = centsToTokenUnits(req.amountMinor);

    // A balance pre-check exists for the ERROR MESSAGE, not for safety — the
    // chain is the real guard. It is retried because public RPC nodes lag:
    // found live on 2026-09-08, when a wallet that had just received a
    // confirmed transfer still read as empty and a legitimate leg was refused.
    const pub = publicClient();
    const balanceOfSender = () =>
      pub.readContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }) as Promise<bigint>;

    let balance = await balanceOfSender();
    for (let attempt = 0; balance < value && attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, 1_500));
      balance = await balanceOfSender();
    }
    if (balance < value) {
      throw new RailError(
        "rail-insufficient-balance",
        `The ${req.from} demo wallet holds ${Number(balance) / 1e6} USDC and this movement needs ${Number(value) / 1e6}. Top it up from the faucet — see docs/demo-wallets-runbook.md.`,
      );
    }

    const wallet = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL),
    });
    try {
      const hash = await wallet.writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "transfer",
        args: [to, value],
      });
      return { reference: hash };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Gas is the other thing that runs out; say which, and how to fix it.
      throw new RailError(
        "rail-send-failed",
        /insufficient funds/i.test(msg)
          ? `The ${req.from} demo wallet is out of gas (Base Sepolia ETH). Top it up — see docs/demo-wallets-runbook.md.`
          : `The transfer could not be sent: ${msg}`,
      );
    }
  },

  async verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifyOutcome> {
    const pub = publicClient();
    const from = demoWalletAddress(req.from as WalletActor);
    const to = demoWalletAddress(req.to as WalletActor);

    // ONE LOOK, NO WAITING (cycle 2). This used to block for up to 60 seconds
    // on waitForTransactionReceipt and then throw. Two things were wrong with
    // that. The honest one: an unmined transaction is `pending`, not an error,
    // and the seam can now say so. The practical one: cycle 1's deploy audit
    // found that a 60-second wait inside a server action can be killed by the
    // platform's function timeout — and since `execute` has already
    // broadcast, that killed the request AFTER the money moved. The pending
    // row survives either way now, but not waiting at all removes the
    // exposure rather than surviving it.
    let chainReceipt;
    try {
      chainReceipt = await pub.getTransactionReceipt({
        hash: receipt.reference as `0x${string}`,
      });
    } catch {
      return {
        status: "pending",
        detail: `Transaction ${receipt.reference} has not been mined yet.`,
      };
    }

    // Mined and reverted is a real answer: it will not happen. Nothing booked,
    // and nothing to reverse, because nothing moved.
    if (chainReceipt.status === "reverted") {
      return {
        status: "failed",
        reason: `Transaction ${receipt.reference} reverted on chain.`,
      };
    }

    verifyUsdcTransfer({
      receipt: {
        status: chainReceipt.status,
        logs: chainReceipt.logs,
        chainId: BASE_SEPOLIA,
      },
      expectedChainId: BASE_SEPOLIA,
      expectedToken: USDC_ADDRESS,
      expectedFrom: from,
      expectedTo: to,
      expectedAmount: centsToTokenUnits(req.amountMinor),
    });

    return {
      status: "settled",
      transfer: {
        reference: receipt.reference,
        evidenceKind: "tx-hash",
        amountMinor: req.amountMinor,
        from,
        to,
        explorerUrl: `${EXPLORER}/tx/${receipt.reference}`,
      },
    };
  },

  /**
   * UNSUPPORTED, and the reason is structural rather than missing work.
   *
   * The platform holds every demo wallet's private key and signs AS the
   * counterparty (see execute above: `demoWallet(req.from)`). A debtor
   * "paying" is the platform moving its own money from one pocket to another,
   * so no payment ever arrives from outside and there is nothing to discover.
   *
   * A real third-party inbound path on this rail would watch ERC-20 Transfer
   * logs where `to` is the platform address — and would be BETTER than fiat,
   * because every transfer carries an exact sender address rather than a
   * bank-formatted name. That is a later cycle; claiming an empty queue today
   * would be claiming we looked.
   */
  async listInbound(): Promise<InboundListing> {
    return {
      supported: false,
      reason:
        "On the USDC rail the platform signs as the counterparty, so no payment arrives from outside. Third-party inbound would mean watching Transfer logs — a later cycle.",
    };
  },
};

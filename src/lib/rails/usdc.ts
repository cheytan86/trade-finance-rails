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
  type VerifiedTransfer,
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

  async verify(req: TransferRequest, receipt: TransferReceipt): Promise<VerifiedTransfer> {
    const pub = publicClient();
    const from = demoWalletAddress(req.from as WalletActor);
    const to = demoWalletAddress(req.to as WalletActor);

    let chainReceipt;
    try {
      chainReceipt = await pub.waitForTransactionReceipt({
        hash: receipt.reference as `0x${string}`,
        confirmations: 1, // demo posture, stated on screen
        timeout: 60_000,
      });
    } catch {
      throw new RailError(
        "rail-not-confirmed-yet",
        `Transaction ${receipt.reference} has not confirmed yet. Nothing has been booked — use Check status to verify it again.`,
      );
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
      reference: receipt.reference,
      evidenceKind: "tx-hash",
      amountMinor: req.amountMinor,
      from,
      to,
      explorerUrl: `${EXPLORER}/tx/${receipt.reference}`,
    };
  },
};

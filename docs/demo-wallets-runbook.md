# Demo wallets — faucet runbook (cycle 1)

Four repo-managed demo wallets move the testnet USDC on **Base Sepolia**
(chain id 84532). They are labelled demo-custodied on every surface that
shows them; the keys live in `.env.local` only (slots in `.env.example`).
Current addresses (generated 2026-09-07 — regenerate freely; addresses are
public facts, keys are not):

```text
funder    0x0F2892a05cB0489b2356f71584e29987D25f49d9   sends funding      needs ETH + USDC
platform  0x10e5B730Dc2a02944372C1a8d64d76514F9D3352   conduit — sends    needs ETH + (receives USDC)
supplier  0xD2930aC2b2B892AD09c01b0EB0A2174eB6a11586   receives only      needs nothing
debtor    0xF05B371805eA97bFBC74e2254089B3c2C9aA8D79   sends repayment    needs ETH + USDC
```

## Funding them (repeat when balances run dry)

1. **Gas (Base Sepolia ETH)** — https://portal.cdp.coinbase.com/products/faucet
   (or any Base Sepolia faucet). Drip to **funder, platform, debtor**.
   Receiving needs no gas; only senders do.
2. **Testnet USDC** — https://faucet.circle.com → network "Base Sepolia" →
   drip to **funder** (funds deals) and **debtor** (repays them).

## The faucet-scale constraint (recorded, not discovered later)

Faucets drip ~10–20 USDC per address per day. **USDC-rail demo deals
therefore use faucet-scale face values (≈10–20.00 USDC)** — the seed and
evals are written that way. The big-number backdrop deals stay on the
demo-internal rail. Decimal note: the ledger's minor units are cents (2dp);
on-chain USDC has 6dp — the rail converts exactly (×10⁴) at its boundary,
and the verifier compares in on-chain units.

## Custody posture

These wallets are platform-custodied by design and the demo is deliberately
not bankruptcy-remote — paper §10 Q18 carries the full analysis and what a
real programme would layer on.

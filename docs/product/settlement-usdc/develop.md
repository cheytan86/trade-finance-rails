# Develop — Settlement seam + USDC (cycle 1) · evidence

Single slice (design Part 2: no agent). Started 2026-09-07. First cycle under
the active boundary: ENHANCE, 15-file allow-list, stop-and-ask off-list.

## Gate 0 — baseline (2026-09-07, real output)

```text
npx tsc --noEmit    0 errors
npm run lint        clean
npm test            59 tests, 7 files, all passing
npm run build       compiled; 8 routes
branch              feat/foundation (cycle-1 branch not yet cut)
tree                design-phase docs uncommitted (committed at rails)
```

"Still healthy" for this cycle = these numbers, plus cycle 0's 59 tests
staying green **untouched** (eval 4's coexistence claim), plus the smoke path.

## Gate 0.5 — contract verification (2026-09-07)

| Line | Verdict |
|---|---|
| New paths free: `src/lib/rails/`, `src/lib/pricing/overdue.ts`, `drizzle/0001*`, `src/features/settlement-usdc/` | HOLDS |
| All 17 allow-listed paths exist | HOLDS |
| Branch `feat/settlement-usdc` unclaimed | HOLDS |
| Flag: none — rail is per-deal data defaulting `demo-internal` (design decision) | HOLDS |
| Untouchables: migration 0000 present; sole ledger writer = `src/lib/ledger/index.ts`; identity seam intact | HOLDS |
| One new dependency authorized by the design: viem (pinned at install) | noted |

**Discrepancies: none.**

## Smoke path (proposed at Gate 0.5)

1. Cycle-0 spine on a **demo-internal** deal — the host flow this feature
   must never break (submit → approve → fund → disburse).
2. App boots with the seat switch; role isolation holds.
3. Grows as legs land: the five-leg USDC deal end to end once built.

## Setup step 1 (recorded in design): demo wallets

Generated at prompt A0 of this cycle; addresses need **Base Sepolia ETH**
(gas) and **testnet USDC** (Circle faucet) before any on-chain prompt runs —
a Chetan-assisted step, scheduled early, not discovered mid-build.

<!-- Prompt evidence appended as the build proceeds. -->

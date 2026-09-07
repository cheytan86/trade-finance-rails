# Manifest — settlement-usdc (cycle 1) · branch `feat/settlement-usdc`

## The contract (from docs/product/settlement-usdc/design.md — verified at Gate 0.5, 2026-09-07)

ENHANCE under the active boundary. Additive by default; **only the allow-list
below may be modified**; an unnamed modification is a stop-and-ask. No flag —
rail is per-deal data defaulting `demo-internal` (recorded design decision).
Branch cut from `feat/foundation` (`main` holds no app).

**New files (additive core):** `src/lib/rails/` (types · demo-internal ·
usdc · verify-usdc · wallets + fixtures/tests) · `src/lib/pricing/overdue.ts`
(+tests) · `drizzle/0001_*` (only after per-change re-approval) · a client
confirm component for /pay · faucet runbook note.

**Allow-list (existing files, each with its reason — design §Integration):**
1. `src/db/schema.ts` — the approved data contract (rail col, enum adds,
   wallets table, evidence uniqueness)
2. `src/lib/domain/states.ts` — 7-state machine
3. `src/lib/domain/states.test.ts` — matrix re-pinned
4. `src/lib/pricing/index.ts` — expose inputs overdue needs
5. `src/lib/pricing/pricing.test.ts` — cover the exposure
6. `src/lib/deals/actions.ts` — rail-aware gates + repay/payout/residual
7. `src/lib/deals/preview.ts` (+ its test) — three new entry shapes, Σ=0
8. `src/lib/queries.ts` — rail/wallet/movement reads
9. `src/components/review-form.tsx` — rail picker
10. `src/components/ui/status-pill.tsx` — repaid/settled
11. `src/components/deal-timeline.tsx` — extended spine
12. `src/app/ops/deals/[id]/page.tsx` — new gates, overdue flag, tx badges
13. `src/app/pay/[invoiceId]/page.tsx` — live repayment
14. `src/app/ops/ledger/page.tsx` — wallet proof panel
15. `scripts/seed.mts` — debtor_cash accounts + wallet rows
16. `.env.example` — wallet key slot NAMES only
17. `package.json` / lock — +viem pinned (the design's one authorized dep)

**Untouchable:** applied migration `0000` · ledger sole-writer rule ·
identity seam · no mainnet config · key material never in db/git/client ·
`PRODUCT_PAPER.md` (amended only with Chetan's confirm — v9 done at design).

**Smoke path:** cycle-0 spine on a demo-internal deal · boots with seat
switch · role isolation — growing to the five-leg USDC deal as legs land.

## Files created

- `src/features/settlement-usdc/MANIFEST.md` — this file (rails)

## Files modified

- `AGENTS.md` (root, branch-only) — foundation block replaced by this
  feature's block (each branch carries exactly its own) (rails)

## Progress notes

- 2026-09-07 · rails: design docs committed on feat/foundation (`757e909`,
  pushed); branch cut; manifest + rules block. Last verified prompt: **00
  (rails)**. Next: A0 (viem + demo wallets; then Chetan faucets ETH + USDC).

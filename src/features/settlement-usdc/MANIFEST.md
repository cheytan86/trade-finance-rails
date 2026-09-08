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
- `src/lib/rails/wallets.ts` + `wallets.test.ts` — the demo wallet registry:
  actor → env-var NAME, key resolved at call time, missing/malformed keys
  refused with named rules and no value echoed (A0)
- `docs/demo-wallets-runbook.md` — addresses, faucet URLs, the faucet-scale
  deal-size constraint, custody posture pointer to paper Q18 (A0)

- `drizzle/0001_swift_luckman.sql` (+ meta) — the approved data contract,
  additive only; applied to Neon 2026-09-08 (A1)

## Files modified

- `AGENTS.md` (root, branch-only) — foundation block replaced by this
  feature's block (each branch carries exactly its own) (rails)
- `package.json` / lock — +viem 2.56.3 pinned (A0)
- `.env.example` — four wallet key slot NAMES (A0)
- `src/db/schema.ts` — rail column, `repaid`/`settled` statuses,
  `repayment`/`payout`/`residual` event types, `debtor_cash` kind, `wallets`
  table, tx-hash-once partial unique index (A1)
- `src/lib/domain/states.ts` — 7-state machine; back-half refusals name
  their own rules (A1, type surface must move with the schema)
- `src/lib/domain/states.test.ts` — matrix re-pinned 5→7 states, 4→6
  transitions; `settled` is now the terminal example (A1)
- `src/lib/queries.ts` — MovementView.type follows the schema enum via
  `$inferSelect` so future event types need no manual edit (A1)
- `src/components/ui/status-pill.tsx` — repaid (ringed dot) / settled
  (filled) treatments (A1)
- `src/lib/deals/spine.integration.test.ts` — test 9 re-asserts the NEW rule
  (disbursed is no longer terminal; both money gates still refuse, naming
  their rules) (A1)
- `scripts/seed.mts` — 3 debtor_cash accounts, wallet rows from .env.local
  addresses (keys never stored) (A1)

## Progress notes

- 2026-09-07 · rails: design docs committed on feat/foundation (`757e909`,
  pushed); branch cut; manifest + rules block.
- 2026-09-07 · custody scope (Chetan): paper v10 Q18, cycle 10 → custody
  cycle, segregation rule from cycle 2 (`12d657c`).
- 2026-09-07 · A0: viem 2.56.3 pinned (+package.json/lock — allow-listed);
  wallet registry + tests; four keys generated into .env.local (never
  echoed; git grep confirms zero key material in tree); .env.example slots;
  runbook with addresses + faucet-scale constraint (USDC-rail deals sized
  10–20 USDC; cents→6dp conversion at the rail boundary noted). 62 tests,
  gates green. Last verified prompt: **A0**.
- 2026-09-08 · wallets funded (Chetan) and verified on-chain: funder/debtor
  20 USDC each, three senders 0.001 ETH; chain id 84532 confirmed.
- 2026-09-08 · A1: migration 0001 generated + applied (all 6 existing deals
  kept `demo-internal`); seed extended (8 accounts, 4 wallet rows —
  addresses only). The schema's new enum values forced the domain type
  surface to move with it: states 5→7 with the back half's refusal
  messages, the pinned matrix 4→6 transitions, MovementView typed off
  `$inferSelect`, StatusPill's two new treatments. Three cycle-0 tests
  updated to assert the NEW rules (disbursed is no longer terminal) rather
  than be loosened. 63 tests, gates green. Last verified prompt: **A1**.
  Next: A2 (the rail seam — types, demo-internal impl, usdc impl, the
  corrected verifier).

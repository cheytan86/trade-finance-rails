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

**Allow-list AMENDMENT, approved by Chetan 2026-09-08** (invoice document
fields — the submit form captured only 4 facts; the invoice number is
load-bearing for cycle 3's reconciliation matching and cycle 8's document
verification, so it is cheaper here than retrofitted):
18. `src/components/submit-invoice-form.tsx` — number, issue date, description
19. `src/app/supplier/page.tsx` — pass the new fields through
20. `src/lib/deals/actions.ts` — already on the list; validation for the new
    fields (issue date before due date; number unique per supplier)

**Reconcile findings (Section D, 2026-09-15)** — `git diff --name-only
feat/foundation` is the truth; the manifest explains it. Four entries the
allow-list did not name, recorded rather than quietly absorbed:
21. `src/components/ui/provenance-badge.tsx` — **a genuine unlisted
    modification**, caught here. It gained an optional `href` so evidence
    that can be checked independently renders as a link (solid cobalt)
    rather than a label (dashed muted). Small, in the spirit of the
    contract, and it should have been surfaced before it was made.
22. `src/components/pay-invoice-form.tsx` — new; the design's contract
    named "a client confirm component for /pay" in prose but not by name.
23. `PRD.md`, `docs/product/CYCLES.md` — programme documents, updated at
    Chetan's direction (custody scope 2026-09-07; the built state machine
    and ops pipeline 2026-09-15). Not app code; recorded for completeness.
24. `drizzle/0002–0004` + `drizzle/meta/*` + `package-lock.json` — migration
    and lockfile artifacts implied by allow-list entries 1 and 17.

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
- `src/lib/rails/types.ts` — THE SEAM: prepare · execute · verify · evidence;
  framework-free, no Next/db/React imports (A2)
- `src/lib/rails/demo-internal.ts` — cycle 0's behaviour as a rail; its
  existence is the abstraction's proof (A2)
- `src/lib/rails/verify-usdc.ts` + test — the corrected verifier: chain id
  explicit per call and mainnet refused outright; ALL matching transfer logs
  summed (not first-log-only); bigint throughout. 12 tests, fixtures encoded
  with viem so the real decoder runs (A2)
- `src/lib/rails/usdc.ts` — the Base Sepolia implementation: balance and gas
  pre-checks with runbook-pointing messages, send, wait, re-derive; the
  cents↔6dp conversion lives here alone (A2)
- `src/lib/rails/index.ts` + `seam.test.ts` — the registry (adding a rail is
  one line) and the seam's own tests, incl. "no rail may look production" (A2)

- `src/lib/pricing/indicators.ts` + test — supplier all-in cost, funder yield,
  platform margin; basis points from bigint amounts, one rounding, never a
  float touching money (A6)
- `src/components/pricing-form.tsx` — the rate card + rail, its own step (A6)
- `src/components/pricing-results.tsx` — the full breakdown + the three
  indicators; labels itself indicative-vs-locked (A6)
- `drizzle/0003_puzzling_vanisher.sql` — the `priced` status (A6)

- `src/components/trade-validation.tsx` — step 1: the invoice as a document
  beside three outcomes (approve · return · reject) (A7)
- `src/components/resubmit-invoice-form.tsx` — the supplier's correction form,
  every field editable, pre-filled (A7)
- `drizzle/0004_striped_snowbird.sql` — `returned` status + `correction_note` (A7)

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
- 2026-09-08 · A2: the seam + both implementations + the corrected verifier.
  84 tests (21 new), gates green. **Proved live on Base Sepolia**: 1.00 USDC
  funder→platform, tx
  `0xfbee46d87345b43acc8edd3fc81d12687aeaa2ad8c283088dcda910fb365c3b2`,
  verified by re-derivation, and the same tx REFUSED against a wrong
  expected amount. Rail modules use .ts-extension relative imports (the
  node-script rule from cycle 0). Last verified prompt: **A2**.
  Next: A3 (overdue math + the three new entry shapes).
- 2026-09-08 · A3–A5: invoice document fields (migration 0002, allow-list
  amended at Chetan's approval), overdue math to the cent, three new entry
  shapes, rail wired into all five gates, screens (rail picker, Basescan
  links, live /pay). **$2 deal settled through all five legs on Base
  Sepolia.** Live testing found an RPC read-after-write lag refusing a
  legitimate leg — the balance pre-check now retries.
- 2026-09-08 · A6 (Chetan: pricing as its own step): `priced` state between
  approval and funding (migration 0003); `approveWithTerms` split into
  `approveInvoice` (decision only, idempotent on double-click) and
  `priceInvoice` (rate card + rail, re-priceable until funding); state
  matrix re-pinned 7→8 states, 6→7 transitions; assertTransition rewritten
  from a nested ternary into a readable rule table. Pricing card shows the
  full breakdown + three indicators, labelled indicative-vs-locked. Two real
  bugs caught by tests: the funding CAS still guarded on `approved` (money
  booked, status did not), and re-approval errored on an already-approved
  deal. 114 tests, gates green. Last verified prompt: **A6**.
- 2026-09-09 · A7 (Chetan: trade validation): ops was approving deals it
  could not see, with only yes/no. The deal page is now three numbered
  cards — 1 · Trade validation (invoice document: parties, number, dates,
  computed payment terms and invoice age, value, description) → 2 · Pricing
  → 3 · Settlement — and validation has three outcomes. New `returned`
  state (migration 0004) is the machine's only two-way edge: ops returns
  with a note, the supplier edits EVERY field and resubmits, and it is
  re-validated from scratch (one `readInvoiceFields` rule set shared by
  submit and resubmit, so a corrected invoice is checked exactly as
  strictly as a fresh one). Return exists only before approval, so
  `approved`/`priced` stay a true record. Matrix re-pinned 8→9 states, 7→9
  transitions. 117 tests, gates green; every seat/state verified over HTTP.
  Last verified prompt: **A7**.

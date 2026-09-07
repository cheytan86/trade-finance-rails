# Design — Settlement seam + USDC rail (cycle 1)

Date: 2026-09-07 · From: `docs/product/settlement-usdc/discovery.md`

## Step 1.0 — Existing-implementation verdict

**Verdict: ENHANCE.**
**Evidence:** a working host exists and is live — 8 pages, 5 tables, 59 green
tests, deployed preview (foundation deploy.md). This feature extends it: the
state machine (`src/lib/domain/states.ts`, its test pins all 25 pairs) gains
transitions; `invoices` gains a rail; `/pay` goes from stub to live; the deal
page's gates become rail-aware. Nothing here repairs a host defect (not FIX);
the sibling verifier's three defects arrive already corrected in new code.

**Current behaviour this design diffs against:** every movement books
instantly with `demo-internal` evidence via `src/lib/ledger` (sole writer);
the machine is terminal at `disbursed`; `/pay/[invoiceId]` renders facts and
an honest stub note; there is no chain code, wallet, or web3 dependency
anywhere (`git grep -i viem` → nothing).

**First cycle under the active boundary** (trigger fired 2026-09-06):
additive by default, the allow-list below is exhaustive, an unnamed
modification is a stop-and-ask.

## Part 1 — Product design

### 1. Feature statement

One settlement interface the state machine sees and rails hide behind, with
two implementations — cycle 0's demo-internal and real USDC on Base Sepolia
moved between labelled, repo-managed demo wallets — carrying a deal through
all five legs to `settled`, every on-chain movement independently re-derived
before booking, and late repayment charged at +2% on both sides of the
spread, borne by the supplier's residual.

### 2. Target workflow (current → changed)

*Current:* submit → approve(terms) → fund → disburse, all demo-internal,
terminal at disbursed. *Changed:*

1. Supplier submits (unchanged).
2. Ops approves with terms **+ the rail**: `demo-internal` | `usdc`
   (Chetan's decision: ops-at-approval). Existing deals keep their rail.
3. **Fund** (ops gate): dialog shows the ledger entries *and*, on USDC, the
   transfer about to happen (funder wallet → platform wallet, amount, both
   addresses labelled "demo wallet"). On confirm the server sends via the
   rail, waits for the receipt (synchronous, ~seconds on Base Sepolia; the
   dialog shows the in-flight state), verifies by re-derivation, then books
   with `tx-hash` evidence. Timeout: nothing books; the hash is shown with a
   **Check status** control that re-verifies and books idempotently.
4. **Disburse** (ops gate): platform wallet → supplier wallet, same shape.
5. **Repayment** (debtor gate, PUBLIC on `/pay/[invoiceId]`): the page shows
   exactly the **face value** — never a moving number (overdue is borne by
   the residual, Chetan's decision) — plus, past due, the flag: "N days past
   due · overdue interest accruing against the supplier's residual". Confirm
   → debtor demo wallet pays face → verified → `repaid`. Exact match only; a
   wrong amount is a named refusal that books nothing and cites cycle 3.
6. **Payout** then **Residual** (ops gates, either order; both done →
   `settled`, order-independent completion): amounts from the locked
   snapshot **plus the overdue split** computed from the actual repayment
   date (below).
7. The ledger view gains the **wallet proof**: per token account, derived
   ledger balance beside the live on-chain balance, equal.

**The overdue model** (Chetan's, 2026-09-07, worked example pinned):

```text
daysLate        = calendar days from due date to repayment date (UTC
                  midnights, same convention as tenor); 0 if on time
overdueSupplier = principal × (supplierRateBps + 200) × daysLate / 360·10000
overdueFunder   = principal × (funderRateBps  + 200) × daysLate / 360·10000
overduePlatform = overdueSupplier − overdueFunder   (computed as the
                  difference — never independently rounded)
Example: P 8,000.00 · 8%/7% → 10%/9% · 10 days late
       → 22.22 charged to supplier · 20.00 to funder · 2.22 platform
Cap: overdueSupplier ≤ residual (a supplier cannot owe more than they were
     due); when capped, funder and platform shares scale down pro-rata from
     the capped total, and the cap is disclosed on the deal page.
Bearer: a PROGRAMME PARAMETER — cycle 1 ships `supplier-residual`;
     `debtor-pays` is the recorded future mode (a constant in config now,
     a column when it becomes selectable).
```

### 3. States & transitions

| State | Entered by | Moved by |
|---|---|---|
| …cycle 0 unchanged through `disbursed` | | |
| `repaid` | verified repayment books | the debtor's payment (verified — the system advances on evidence, not on the click) |
| `settled` | payout AND residual both booked | ops confirms each; completion is automatic and order-independent (the copied `maybeCompleteInvoice` property) |

- Matrix grows 5→7 states; the pinned test grows with it (allow-listed).
  New legal moves: `disbursed→repaid`, `repaid→settled`. Everything else
  stays refused; `settled` is terminal.
- **Overdue is a display condition** (past due ∧ not repaid), never a state.
- Irreversible: every booked movement (unchanged). No flag exists on this
  feature's host surfaces — rail-awareness is data (`invoices.rail`), and
  new deals default `demo-internal`, so shipping dark = not picking usdc.

### 4. Data contract

Reads/Writes: the five cycle-0 tables plus (each a surfaced decision,
re-approved before its migration is written — migration `0001`, additive):

- `invoices.rail` — new column, enum `settlement_rail` (`demo-internal` |
  `usdc`), NOT NULL default `demo-internal` (backdrop stays valid untouched).
- `invoice_status` enum += `repaid`, `settled`.
- `settlement_event_type` enum += `repayment`, `payout`, `residual`.
- `account_kind` enum += `debtor_cash` (per-debtor, mirrors `funder_cash`'s
  "external money" convention; seed adds the rows).
- **`wallets`** — new table: `party_id` (null = platform), `address`,
  `key_env` (the NAME of the env var holding the key — **key material never
  enters the database**), unique per party. Seed maps the demo actors.
- **Evidence uniqueness:** partial unique index on
  `settlement_events(evidence_ref) WHERE evidence_kind = 'tx-hash'` — one
  transaction can never settle two legs.

Pricing snapshot: unchanged fields; overdue derives at repayment time from
snapshot rates + the +200bps rule constant + the repayment event's date (no
new snapshot fields, no new invoice columns — single source: the event).

Fixtures: seed unchanged in behaviour (all backdrop `demo-internal` — the
coexistence proof); new verifier fixtures: recorded receipt shapes for wrong
chain, wrong token, wrong recipient, wrong amount, multi-transfer (the
sibling's first-log-only defect gets the fixture that would have caught it),
plus the overdue worked example as a pricing test vector (2222/2000/222).

### 5. Screens & components

Vocabulary: strict subset of `DESIGN_SYSTEM_NOTES.md` (rewritten 2026-09-07
from the cycle-0 components). Two vocabulary additions, named here as
decisions: a **tx-hash link treatment** (ProvenanceBadge + Basescan href,
mono, external-link affordance) and a **wallet label** (dashed "demo wallet"
badge beside any address). Everything else reuses: ConfirmDialog for all
five gates, StatusPill (+`repaid` solid-green variant, `settled` distinct —
Design note: `settled` gets the good colour with a filled double-dot or
similar; exact treatment at build, within the palette), Amount, Card, Table,
deal-timeline extended to the seven-state spine, amber in-flight during
sends (the flight token's intended tenant).

- **review-form**: + rail picker (radio: demo-internal | usdc).
- **deal page**: gates for payout/residual; overdue flag + accrual line
  past due; tx-hash badges in Movements; in-flight during confirms.
- **/pay/[invoiceId]**: live — face value (never moving), overdue flag when
  late ("borne by the supplier's residual"), debtor ConfirmDialog, then the
  paid state with its tx hash.
- **/ops/ledger**: wallet-proof panel — per token account: derived balance
  beside live on-chain balance, equal or loudly not.
- New (feature folder): rail seam UI helpers only if needed; all rail logic
  lives in `src/lib/rails/`.

### 6. Permissions

Unchanged mechanism (`getIdentity()` seam; `seatGate` first line). Ops seat
gates fund/disburse/payout/residual. **Repayment is public by design** — a
payment link needs no seat; its gate is the confirm dialog itself, its
idempotency key (`repayment:{invoiceId}`) makes double-pay refuse, and the
demo wallet (not the visitor) is the payer. No auth is weakened: the debtor
surface was always public.

### 7. Error & edge handling

- Verifier refusals, each named, each booking nothing: wrong chain id
  (mainnet or anything ≠ the expected id — a REFUSAL, not a config), wrong
  token contract, wrong recipient, wrong sender (where mandated), wrong
  amount (sum of ALL matching transfer logs — never first-log-only),
  transaction failed/absent, insufficient confirmations (depth: 1
  confirmation on Base Sepolia, stated on screen as demo posture).
- Send timeout: hash shown, nothing booked, **Check status** re-verifies
  idempotently. A tx that landed but was never booked is recoverable, never
  double-booked (evidence uniqueness + idempotency key).
- Wrong-amount repayment: named refusal citing cycle 3; the on-chain
  transfer genuinely happened — the message owns that gap.
- Wallet unfunded / out of gas: named error before send ("demo wallet needs
  faucet funding — see runbook"), never a raw RPC trace.
- Overdue cap: when the charge hits the residual cap, the deal page says so.
- Demo-internal deals: behave exactly as cycle 0 (the trivial rail).

### 8. Human gates

Five, each before its consequence, each showing the exact entries + (USDC)
the transfer (from-wallet, to-wallet, amount) before anything moves: Fund,
Disburse (ops — existing gates, now rail-aware), Repay (debtor, public),
Payout, Residual (ops — new). The browser posts `{invoiceId}`; the server
recomputes amounts (snapshot + overdue-at-today), signs, sends, verifies,
books. No existing gate is weakened; two are added.

## Part 2 — The agent question (default no)

**Step needing judgment:** none — concede. Sending is signing, verifying is
re-derivation, overdue is arithmetic, and every decision (rail, terms,
confirms) is deliberately human.
**What it would read that product logic cannot evaluate:** nothing.
**Cost per run vs value:** any cost loses to zero value; no model API exists
in this product by decision.
**Failure mode:** an agent could only mis-move money — what the gates and
the verifier exist to prevent.

**Verdict: NO AGENT** — ships as Part 1 alone. Discovery row 6 confirmed.

## Part 3 — Agent blueprint

Not earned. Omitted.

## Build order

Single slice — the substrate is the feature.

## Integration contract

**Branch:** `feat/settlement-usdc`, cut from `feat/foundation` (`main` holds
no app — recorded in foundation release.md). **Flag:** none needed — rail is
per-deal data defaulting to `demo-internal`; shipping dark = not selecting
usdc. Recorded as a decision.

**New files (the additive core):**
- `src/lib/rails/` — `types.ts` (the seam: prepare · execute · verify ·
  evidence), `demo-internal.ts`, `usdc.ts` (viem client, send),
  `verify-usdc.ts` (the corrected verifier), `wallets.ts` (env-keyed demo
  wallet registry), fixtures + tests.
- `src/lib/pricing/overdue.ts` + tests (the model above, to the cent).
- `drizzle/0001_*.sql` (the data contract, after re-approval).
- `docs/` runbook note: faucet-funding the demo wallets (cycle setup step 1).

**Allow-list (every existing file to be modified, with its reason):**
- `src/db/schema.ts` — the data contract above
- `src/lib/domain/states.ts` + `states.test.ts` — 7-state machine, matrix re-pinned
- `src/lib/pricing/index.ts` + test — expose what overdue needs (no behaviour change to existing outputs)
- `src/lib/deals/actions.ts` — rail-aware gates + repay/payout/residual actions
- `src/lib/deals/preview.ts` + test — three new entry shapes (Σ=0 by test)
- `src/lib/queries.ts` — rail/wallet/movement reads
- `src/components/review-form.tsx` — rail picker
- `src/components/ui/status-pill.tsx`, `src/components/deal-timeline.tsx` — repaid/settled
- `src/app/ops/deals/[id]/page.tsx` — new gates, overdue flag, tx badges
- `src/app/pay/[invoiceId]/page.tsx` (+ a client confirm component, new file) — live repayment
- `src/app/ops/ledger/page.tsx` — wallet proof panel
- `scripts/seed.mts` — debtor_cash accounts + wallet rows
- `.env.example` — wallet key slots (names only), documented
- `package.json` / lock — **+viem, pinned exact** (the one new dependency, cost stated: the chain client the rail cannot exist without)
- `src/features/settlement-usdc/MANIFEST.md`, root `AGENTS.md` (branch block) — process rails

**Untouchable:** applied migration `0000` · the ledger invariant and its
sole-writer rule · the identity seam (`getIdentity()` stays the only cookie
reader) · `PRODUCT_PAPER.md` except via the amendment Chetan confirms ·
no mainnet config anywhere · key material never in db, git, or client code.

## Eval plan

1. **Happy path:** one USDC deal, five legs, five distinct tx hashes,
   `settled`; ledger Σ=0 throughout; wallet proof equal — **and** a late
   variant reproducing Chetan's worked example to the cent (22.22 / 20.00 /
   2.22 at 10 days on 8,000 principal).
2. **Edge — verifier refusals by fixture:** wrong chain, wrong token, wrong
   recipient, wrong amount, multi-transfer partial-match — each a named
   refusal, nothing booked.
3. **Edge — evidence reuse:** the same tx hash offered for a second leg is
   refused by the database, not the UI.
4. **Edge — coexistence (the seam's proof):** a `demo-internal` deal runs the
   full lifecycle unchanged; cycle 0's 59 tests stay green untouched; no
   rail-specific branch exists in the state machine.
5. **Boundary:** an unverified movement cannot book — remove/timeout the
   receipt and the deal does not advance; and the overdue cap holds (a deal
   999 days late charges exactly the residual, never more).

## Build-readiness gate

- Job in one sentence: **yes** (§1).
- Every fact traced: **yes** — decisions to Chetan's answers (dated), host
  facts to files, math to the pinned example.
- Missing-data behaviour known: **yes** (§7 — including the timeout path).
- Human gate before every consequence: **yes** (§8 — five gates).
- One eval tests the limit: **yes** (eval 5).
- Contract names every touched file: **yes** — the allow-list above.
- Part 3: did not run — no agent, reasons in Part 2.

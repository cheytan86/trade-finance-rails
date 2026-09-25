# Discovery — Settlement seam + USDC rail (cycle 1)

Date: 2026-09-07 · Verdict at Step 2: **go** (scope confirmed at the grill:
all five legs, repo-managed demo wallets)

Track: **FULL** (weight test: moves testnet money · changes schema · touches
many files. No model calls — ever). **The boundary is ON for the first time:**
cycle 0's output is host code (the trigger fired 2026-09-06, recorded in
STACK_RULES.md), so this cycle runs branch + allow-list + stop-and-ask, and
every modification to existing files must be named in the design's contract.

## 1. User

The same four seats as the live demo, with two of them gaining real actions:
**platform ops** still drives the gates — but confirming Fund now causes an
actual USDC transfer on Base Sepolia, watched from pending to confirmed —
and **the debtor's public payment page goes live**: whoever opens
`/pay/[invoiceId]` can pay the invoice in USDC and watch the deal settle.
All on-chain sends come from **repo-managed, faucet-funded demo wallets**
(decided at the grill): zero visitor friction, testnet-only custody of
worthless tokens, labelled as demo-operated on every surface that shows them.

## 2. Workflow

1. Supplier submits an invoice (unchanged from cycle 0).
2. Ops approves with terms **and picks the deal's settlement rail**:
   `demo-internal` (cycle 0's behaviour, still fully supported) or `usdc`.
   Per-deal configuration, exactly as PRD §3 promises. *(Who chooses was put
   to Chetan at review 2026-09-07 — ops-at-approval confirmed over
   supplier-requests and defer-to-cycle-4.)*
3. **Fund** on a USDC deal: the confirm dialog shows the entries *and* the
   on-chain transfer about to happen (funder demo wallet → platform wallet,
   amount in USDC). On confirm the server sends the transaction, the deal
   shows the in-flight state while it confirms, the verifier re-derives the
   transfer from the chain (never trusting the sender's claim), and only a
   verified receipt books the movement — evidence kind `tx-hash`, linking
   to Basescan.
4. **Disburse**: same shape, platform wallet → supplier wallet.
5. **Repayment — the new half.** At `/pay/[invoiceId]` the debtor sees the
   amount due and pays in USDC (demo debtor wallet behind its own confirm).
   Exact-match verification only in this cycle: a wrong amount is a named
   refusal that books nothing — part-payment and overpayment handling is
   deliberately cycle 3's (reconciliation), and the refusal message says so.
   *(Put to Chetan at review 2026-09-07: refuse-and-name-cycle-3 confirmed
   over booking-as-unapplied-cash. Consequence worth stating: a wrong-amount
   testnet transfer will have genuinely happened on-chain while the ledger
   deliberately records nothing — the message must own that gap until
   cycle 3 closes it.)*
6. **Payout and residual**: ops gates, per the locked snapshot's waterfall —
   funder receives principal + return, supplier receives the residual.
   Completion is order-independent (the copied `maybeCompleteInvoice`
   property): both paid, deal `settled`.
   *(Scope added at design, Chetan 2026-09-07: **overdue interest.** Late
   repayment accrues on the principal, act/360: the supplier is charged at
   supplier-rate+2%, the funder receives at funder-rate+2%, the platform
   keeps the difference; borne by the supplier's residual in this cycle —
   the bearer is a programme parameter, `debtor-pays` recorded as the
   future mode. Worked example pinned in design.md §2.)*
7. The ledger view grows the **live account-level proof** (paper §7): each
   token account's derived ledger balance beside the wallet's actual
   on-chain balance, equal — the daily proof, demonstrated continuously.

States extend: `disbursed → repaid → settled` (the exact machine, including
whether matured-unpaid appears as a state or a display condition, is Design's
call). Reversals and exception-holds remain cycle 3 territory.

## 3. Trigger

Two, one per half: the supplier's live submission starts a deal (unchanged);
**the debtor opening the payment link and confirming payment** starts the
settlement back half — the public surface acting for the first time.

## 4. Current process (in the app today)

Settlement evidence is `demo-internal` by construction: `src/lib/ledger`
defaults `evidenceKind`, and the schema's `evidence_kind` enum already
declares `tx-hash`, `circle-payment-id` and `statement-line` as future rows
(`src/db/schema.ts` — added in cycle 0 precisely so rails add rows, not
columns). The state machine is terminal at `disbursed`
(`src/lib/domain/states.ts`; its test pins all 25 pairs). `/pay/[invoiceId]`
renders invoice facts and an honest "payment arrives with the rails" note.
No chain code exists: the sibling repo's verifier was deferred to this cycle
by recorded contract amendment (foundation design.md, 2026-09-06) with its
three defects named — hard-coded chain id, first-matching-log-only, float
amounts — all fixed at the door here. No wallet, key, or web3 dependency is
anywhere in the repo (`git grep -i viem` → nothing).

## 5. Pain / gap

The product's whole thesis — *the settlement rail is a priced decision* —
currently has zero rails to decide between. Every movement is a database row
claiming settlement happened; nothing external corroborates it. The paper's
§7 mechanics (verification contract, account-level proof, evidence beside
meaning) exist as structure but not yet as fact. And the headline comparison
(cycle 4) cannot price rails that don't exist: this cycle and the two after
it are the comparison's raw material.

## 6. Opportunity

Build the **settlement seam** — the interface the state machine sees, which
every rail implements and no rail leaks through — and its first real
implementation:

- The rail interface (Design names it): roughly *prepare/send* (gated),
  *verify* (re-derive from the source of truth), *evidence* (what proves it).
  The cycle-0 `demo-internal` behaviour becomes the trivial implementation
  of the same interface — proof the abstraction is real.
- The corrected chain verifier: explicit chain id per call, **all** matching
  transfer logs checked, bigint amounts, confirmation-depth policy stated.
- Demo wallet management: keys server-side only (env, never NEXT_PUBLIC_,
  never in git — the D1 scan patterns already cover leaks), funded from the
  Base Sepolia faucet as this cycle's **first setup step** (recorded now so
  it isn't a mid-cycle surprise, like Circle's balance in STACK_RULES).
- The deal lifecycle back half: repayment, payout, residual, `settled`.

**Agent or product: all PRODUCT work.** Sending, watching and verifying
transactions is deterministic; judgment stays human at the gates. No step
reads anything a rule cannot evaluate. (Hypothesis for Design's Part 2, per
the method — but nothing here argues otherwise.)

## 7. Data plan

**Existing tables touched (they exist; named):** `invoices` gains the
per-deal rail choice; `settlement_events` likely gains a uniqueness rule on
evidence (one tx hash never settles two legs) — exact columns are Design's
data contract, each one resurfaced for approval there. `parties` vs a new
wallet mapping (which actor owns which address) is a Design decision;
**private keys never live in the database** — env only.

**Synthetic fixtures:** the seed keeps working unchanged (all backdrop stays
`demo-internal` — proving rail coexistence); eval fixtures add recorded
transaction shapes for the verifier's refusal tests (wrong chain, wrong
token, wrong recipient, wrong amount, multi-transfer transactions — the
sibling's first-log-only defect gets a fixture that would have caught it).
Real on-chain state: Base Sepolia testnet only; faucet USDC; no real value
anywhere. No real person or company, as always.

## 8. Human boundary

Never without a person on screen: any on-chain send (fund, disburse, pay,
payout, residual) — each behind its own confirm showing amount, from-wallet,
to-wallet, and the entries that will book on verification. The browser posts
decisions; the server signs, sends, verifies and books.

Never at all: mainnet (chain id pinned and asserted per call — a mainnet id
is a refusal, not a config); a private key client-side, in git, in the
database, or echoed to any log; booking an on-chain movement without the
verifier's independent re-derivation; claiming anything beyond "demo wallets
holding worthless testnet tokens"; touching the untouchables (applied
migration 0000, the ledger invariant, the identity seam).

## 9. Success metric

1. One deal completes all five legs on USDC: five distinct tx hashes, every
   movement Σ=0, state `settled` — including a late variant reproducing the
   pinned overdue example to the cent (P 8,000 · 10%/9% · 10 days →
   22.22 / 20.00 / 2.22).
2. The live proof holds: for each token account, ledger SUM(entries) equals
   the wallet's on-chain balance, shown side by side.
3. Every verifier refusal is tested by fixture: wrong chain, wrong token,
   wrong recipient, wrong amount, second use of a spent tx hash — each a
   named refusal booking nothing.
4. The seam is proved by coexistence: `demo-internal` deals run unchanged
   through the same machine (cycle 0's 59 tests still green), and the state
   machine code contains no rail-specific branches.
5. The boundary held: `git diff` against the host touches only the files the
   design's allow-list names.

## 10. Demo idea

The demo will show [ops approving a deal onto the USDC rail] → [Fund: the
confirm shows entries + the real transfer; pending in amber; then a Basescan
tx hash where the dashed badge used to be] → [the debtor opening the public
payment link and paying the invoice in USDC] → [payout and residual
completing the waterfall; the deal reads settled with five hashes] → [the
ledger view proving it live: derived balance beside on-chain balance, equal]
— on the existing surfaces (deal page, /pay, ledger view), extended per the
design's allow-list.

---

*Why this cycle (grill Q10): it is the plan's hinge — the seam defined here
is the interface Circle (cycle 2), mock Open USD and the Visa adapter
(cycle 11) implement, and the priced comparison (cycle 4) consumes. Getting
the abstraction right once beats retrofitting it three times.*

*Gate 0.5 note for Develop: `main` holds no application code, so this
cycle's branch cuts from `feat/foundation` (release parked at R0 — recorded
in docs/product/foundation/release.md). The first setup step is funding the
demo wallets from the Base Sepolia faucet.*

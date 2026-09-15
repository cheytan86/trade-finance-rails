# Develop — Settlement seam + USDC (cycle 1) · evidence

Single slice (design Part 2: no agent). Built 2026-09-07 → 2026-09-15.
First cycle under the active boundary: ENHANCE, allow-list enforced.

## Gate 0 — baseline (2026-09-07, real output)

```text
npx tsc --noEmit    0 errors
npm run lint        clean
npm test            59 tests, 7 files, all passing
npm run build       compiled; 8 routes
branch              feat/foundation (cycle-1 branch cut from it; main has no app)
```

## Gate 0.5 — contract verification

All paths free, all 17 allow-listed files present, branch name unclaimed, no
flag (rail is per-deal data defaulting `demo-internal`), untouchables intact.
**Discrepancies: none.** One authorized dependency: viem, pinned exact.

## The 8 evidence rows (Section D, 2026-09-15)

**1. Slice scope.** The only slice. It proves one capability end to end: a
receivables deal settling on a real rail, with the settlement mechanism behind
an interface the state machine cannot see through. Entered from the ops queue
at `/ops`; the debtor's leg from the public `/pay/[invoiceId]`. Deferred by
design: the fiat rail (cycle 2), part payments and reconciliation exceptions
(cycle 3 — cycle 1 settles exact amounts only and says so), multi-token and
the Visa adapter (cycle 11).

**2. User interaction.** Ops opens a submitted deal and sees **1 · Trade
validation** — the invoice as a document (parties, number, value, issue and
due dates, computed payment terms and invoice age, description) — and chooses
**Approve**, **Return for corrections** (with a note the supplier acts on), or
**Reject** (with a reason, terminal). Approved deals reach **2 · Pricing**:
the rate card and settlement rail, then the full breakdown plus three
indicators; re-priceable until funding. Then **3 · Settlement**: Fund,
Disburse, Pay out, Pay residual — each a confirmation showing the exact ledger
entries and, on the USDC rail, the transfer about to happen. The debtor pays
at `/pay/[invoiceId]`, publicly, with its own confirmation. A returned deal
appears on the supplier's page with ops's note and a pre-filled correction
form; everything is editable and resubmission re-validates from scratch.

**3. Data used.** *Synthetic:* the seed builds 7 parties, 8 accounts, 4 demo
wallets (addresses only — key material never reaches the database) and 7
backdrop invoices spanning submitted, returned, priced, refused, funded and
disbursed, all on the demo-internal rail so rail coexistence is visible
without staging it. **No live data source, no real company or person.**
*Real:* four tables gained columns or enum values across migrations 0001–0004
(`invoices.rail`, the `returned`/`priced` statuses, the three new event types,
`debtor_cash`, `wallets`, `correction_note`, the invoice document fields), and
one partial unique index so a transaction hash can never settle two legs.
On-chain state is Base Sepolia testnet USDC only.

**4. Eval cases.** 1 happy: five legs, five hashes, the overdue example to the
cent. 3 edge: verifier refusals by fixture; evidence reuse refused by the
database; rail coexistence with cycle 0 untouched. 1 boundary: an unverified
or unbalanced movement cannot book.

**5. Eval results.** Full record in `evals.md`; run 2026-09-15 against the
working tree at `de75832`.

```text
case                    expected                      actual                       verdict
1 happy path            5 legs, 5 hashes, Σ=0         $3.00 deal settled; 5        PASS
                                                      distinct txs; overdue
                                                      22.22/20.00/2.22 exact
2 verifier refusals     each refuses, names rule      12 fixture tests; mainnet    PASS
                                                      refused for 5 chain ids
3 evidence reuse        refused by Postgres           unique constraint            PASS
                                                      settlement_events_tx_hash_once
4 coexistence           cycle 0 untouched             42 cycle-0 tests green;      PASS
                                                      0 rail branches in states.ts
5 the boundary          nothing books unverified      "entries must sum to zero;   PASS
                                                      got -1 minor units"
```

**6. Improvement made.** Section C found no failures, so the honest
improvement is the one live testing forced earlier: *before* — the USDC rail's
balance pre-check refused a legitimate disbursement, claiming the platform
wallet was empty when it held 2.70 USDC; the public RPC node had not caught up
with a transfer we had just confirmed. *Change* — the pre-check now retries
before refusing, with a comment recording that the pre-check exists for the
error message and the chain is the real guard. *After* — the same five-leg
path completed on the next run. No test suite could have found this; only
running against the actual chain did.

**7. Known limitations.** (a) Exact amounts only — a wrong-amount repayment is
refused with a message naming cycle 3, so a real on-chain transfer can happen
that the ledger deliberately does not record; the message owns that gap.
(b) Faucet scale: USDC deals are sized 2–20 USDC because faucets drip ~10–20
per day. (c) The demo wallets are platform-held and the demonstration is
deliberately not bankruptcy-remote (paper §10 Q18). (d) Confirmation depth is
one block — a demo posture, stated on screen. (e) Rates are illustrative;
consistent arithmetic is not calibrated pricing. (f) The branch is unmerged
and the live demo still shows cycle 0 until Deploy runs.

**8. Evidence walkthrough.** A supplier submits an invoice with its document
facts. Ops opens it and — for the first time — reads the invoice before
deciding: parties, number, value, dates, payment terms, what was supplied.
They return it with "the description does not match the purchase order"; the
supplier sees exactly that note on their own page, fixes the deal and
resubmits, and it re-enters validation checked as strictly as a new one. Ops
approves, then prices it: 85% advance, 9.50% supplier, 8.00% funder, and the
panel answers what that *means* — the supplier's all-in cost, the funder's
yield, the platform's margin in basis points of face. Choosing the USDC rail,
Fund sends real testnet USDC on Base Sepolia; nothing books until the transfer
is re-derived from the chain, and where a dashed demo badge used to sit there
is now a link to Basescan anyone can open. Disburse, then the debtor pays at a
public link, then payout and residual — five legs, five checkable
transactions, and if the debtor paid late the overdue interest appears as its
own lines: charged to the supplier's residual, shared with the funder, the
platform keeping the spread.

## Final gate (Section D, 2026-09-15)

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             117 tests, 12 files, all passing
npm run build        compiled successfully
manifest reconcile   git diff --name-only feat/foundation → 55 files; four
                     entries the allow-list did not name are recorded in the
                     manifest, including ONE genuine unlisted modification
                     (provenance-badge.tsx gained an href) caught here rather
                     than absorbed silently
data boundary        identity read only in src/lib/roles; ledger written only
                     in src/lib/ledger — both still single-writer
key hygiene          git grep finds no key material in the tree; .env.local
                     gitignored; no key in any Vercel scope
rail posture         no mainnet id can verify (5 refused by test); every rail
                     label contains "demo" or "testnet", asserted by test
```

## Deployed (2026-09-15)

**https://trade-finance-rails-git-feat-settlem-d91bd6-cheytan86s-projects.vercel.app**

Preview of the unmerged `feat/settlement-usdc` branch — not production. (The
branch name exceeds Vercel's alias length, so the stable alias is the hashed
form above rather than the usual full-branch URL; it follows the branch and
moves only on push.) Verified live: the three ops stages render, validation
offers its three outcomes with the invoice document, the pricing panel shows
the locked snapshot and indicators, and the supplier's correction card
appears with ops's note. Settings unchanged from cycle 0's deploy record:
`DATABASE_URL` in the Preview scope only, deployment protection off,
production dark.

## Section B — native polish (2026-09-15)

Audited by measurement, not memory:

```text
type sizes in use   11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 19, 24 px
non-token colours   none
tracking utilities  tracking-tight, tracking-wide only
```

The audit found that `DESIGN_SYSTEM_NOTES.md`'s type scale was **incomplete**
— 19px (stat figures) and 14px (the landing lede) were already in the host
from cycle 0 but unrecorded. The notes are the authority for "a strict subset
of the host's vocabulary", so an incomplete scale would have made a
legitimate size look like drift. Corrected, with the audit command written
into the file so the next pass measures. Three cycle-1 patterns were added to
the notes: the numbered ops pipeline, evidence-as-link, and the
document-under-review layout.

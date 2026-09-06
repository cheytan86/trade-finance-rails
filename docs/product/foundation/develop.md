# Develop — Foundation (cycle 0) · evidence

Single slice (design Part 2: no agent — product track only). Started 2026-09-06.

## Gate 0 — baseline (recorded 2026-09-06, real output)

`STACK_RULES.md` gate section: **no gate commands exist yet** — cycle 0's job
is to create them. The baseline is therefore the audited absence, re-verified
at this gate:

```text
source files (*.ts *.tsx *.js *.sol)   0
package.json                           does not exist
commits                                0  ("branch 'main' does not have any commits yet")
current branch                         main (unborn)
working tree                           11 untracked paths — all documentation/process
src/                                   does not exist
```

Baseline meaning for this phase: "still healthy" = the gate commands that
cycle 0 establishes (`tsc --noEmit · lint · test · build`) go green and stay
green from the prompt that creates them onward, and STACK_RULES.md's gate
section is rewritten with the real numbers. A red gate can never be blamed on
a pre-existing condition — nothing pre-exists.

## Gate 0.5 — contract verification (2026-09-06)

The design replaces the feature-folder/flag/allow-list pattern with a
**created-file map** (NEW-project mode, no host to protect — STACK_RULES.md
boundary mode). Verified line by line:

| Contract line | Verdict | Evidence |
|---|---|---|
| Scaffold paths free (`package.json`, `next.config.ts`, `src/app/…`) | HOLDS | no `package.json`, no `src/` — commands above |
| Data paths free (`drizzle.config.ts`, `src/db/`, `drizzle/`, `scripts/seed.ts`) | HOLDS | no such files/dirs |
| Ledger/money/pricing/rails/roles module paths free | HOLDS | no `src/` |
| Route paths free (`/supplier`, `/ops`, `/funder`, `/pay/[id]`) | HOLDS | 0 `page.tsx` in repo |
| Flag: none — foundation is the host | HOLDS | recorded decision, design §3; no `NEXT_PUBLIC_ENABLE_*` anywhere |
| Env: `DATABASE_URL` slot exists in `.env.example`; no new secrets | HOLDS | `.env.example` lines 21–24 |
| Untouchables: kit folders, other features' docs, `PRODUCT_PAPER.md`, no model key/mainnet | HOLDS | none touched; nothing stages them |
| Git: zero commits; nothing committed without explicit go-ahead | HOLDS | `git log` fatal: unborn branch |

**Discrepancies: none.** One NEW-mode adaptation surfaced for approval rather
than adapted silently: `feat/foundation` cannot be cut from `main` because
`main` has no commits — the rails therefore require the repo's **first
commit** (the 11 documentation/process paths, on `main`), then the branch.

## Smoke path (proposed at Gate 0.5)

Nothing is clickable yet, so the smoke path phases in:

1. From the prompt that creates the scaffold: the app boots and the shell
   renders with the role switch.
2. From the prompt that completes the spine: submit → approve → fund →
   disburse on one invoice, supplier surface shows payment (STACK_RULES.md
   smoke candidate 1).
3. From the same prompt: switch each role and confirm it sees only its own
   surface (candidate 3).

## Test pass after A5 (2026-09-06) — what was found and fixed

The spine was exercised end to end against the real Neon database (not
mocked: only Next's request-scoped `cookies`/`revalidatePath` are stubbed),
plus hostile-input probing over HTTP. **54 tests green**, four gate commands
green, and the database returns to its seeded state after every run.

**Issues found and fixed:**

1. **Page and action disagreed about identity.** A cookie naming a
   non-existent party rendered "Acting as Amber Textiles" while the submit
   action refused it as unknown. Fixed with one resolution rule —
   `resolvePartyForSeat` in `src/lib/queries.ts` — used by both the pages and
   the actions. Pinned by integration test 13.
2. **Terms that book a loss were accepted.** Ops could approve a deal whose
   funder rate exceeded what the supplier pays, so the platform paid on every
   deal. Approval now prices the proposed terms and refuses a negative margin,
   naming the arithmetic. Test 10c proves both the refusal and that a fee
   covering the gap makes the same deal fine.
3. **Past-due invoices could be submitted** and would price at zero tenor.
   Now refused: a receivable past its due date is a collections problem.
4. **Rates were unbounded** — 950% p.a. was accepted. Now 0–100%, both sides.
5. **Non-deterministic funder selection.** The gate dialog and the booking
   action each picked "a" funder by row order; with more than one funder they
   could have disagreed about whose cash moved. Both now order by name.
6. **Unfiltered account lookup.** `funderPositions` matched any account
   belonging to the funder rather than its cash account specifically.
7. **Dead code removed:** `goToDeal`, `assertMinorUnits`, `demoFunder`, and a
   duplicated balance helper (now using the ledger's own `balanceOf`).

**Hostile input, probed over HTTP:** malformed UUIDs, a SQL-injection-shaped
invoice id, a broken cookie and a cookie claiming an unknown party all return
404 or degrade safely — no stack traces, no 500s, no data.

**Invariants verified in the database after the run:**
`SUM(amount_minor)` over every entry ever booked = **0** · zero unbalanced
events · zero orphaned events · identity read in one module · ledger written
in one module.

## Gap audit (2026-09-06, Chetan: "test for any gaps") — five found

1. **No race guards on state transitions.** All four status updates were
   read-check-write; two ops tabs racing approve/refuse would let the last
   write win — including resurrecting a refused deal with its reason wiped.
   Fixed: every transition is now compare-and-swap (the WHERE clause repeats
   the status precondition, zero rows updated = "the deal moved while you
   were deciding"). Money was never at risk — the idempotency key already
   guarded bookings — but state was.
2. **Design §3 promised "terms are editable until funding"; the UI only
   allowed editing at `submitted`.** Fixed: an approved deal shows an
   "Update terms" form (re-approval — same margin check, refuse hidden
   because refusing an approved deal is not a designed transition); once
   funded, locked. Tests 13b/13c pin both directions.
3. **UX dead end at the role gate.** A supplier clicking their own invoice
   hit the ops gate, and switching dumped them at /ops instead of the deal.
   Fixed: the gate carries a validated `returnTo` (same-origin absolute paths
   only — `safeLocalPath`, unit-tested against open-redirect shapes).
4. **No README** in a repo licensed for public reading. Written: what it is,
   what exists, the structural rules, how to run it, provenance and license.
5. **`src/lib/rails/verify.ts` — named in the design contract as a cycle-0
   copy, not done.** The chain verifier was deferred to cycle 1 without the
   deviation being recorded anywhere. Surfaced as an open decision rather
   than silently adapted (Gate 0.5 rule); the case for deferral: the
   verifier's corrected interface (explicit chain id, all-logs matching) IS
   cycle 1's settlement seam design, and porting it now would add the viem
   dependency for code nothing calls. **Decided by Chetan 2026-09-06: defer
   to cycle 1; the design contract carries the amendment with the reason.**

After the audit: **59 tests, four gates green**, the terms-edit form and
returnTo verified rendering over HTTP against the production build.

## The 8 evidence rows (Section D, 2026-09-06)

**1. Slice scope.** The only slice — the design's Part 2 verdict was "no
agent", so there is no second one. It proves one loop end to end: a
receivables deal from a supplier's submission to disbursement, with every
money movement booked as balanced double-entry ledger entries. There is no
"existing product" to integrate into — this cycle *created* the host: the
routes are `/supplier`, `/ops`, `/ops/deals/[id]`, `/ops/ledger`, `/funder`
and the public `/pay/[invoiceId]`, entered from the landing page's four seat
cards. **Deferred by design, not omitted:** the settlement rails (evidence is
labelled `demo-internal` until cycle 1), repayment/payout/residual legs, the
credit machinery behind approval (cycles 6–7), and real sign-in (cycle 4a).

**2. User interaction.** A visitor picks a seat from the switch in the top
bar — no sign-in, by design. As **supplier**: fills the New-invoice form
(debtor, face value, due date) and submits; sees only their own book, and can
flip between Amber and Ostrava to watch isolation hold. As **ops**: opens a
submitted deal, sets terms (advance rate, supplier rate, funder rate,
transaction cost) and either **Approves** or **Refuses with a written
reason**; then **Fund…** and **Disburse…**, each opening a confirmation that
lists the exact entries about to book and their sum before anything happens.
Those two gates are the human boundary: nothing books without a person
confirming, and the browser posts only the invoice id — every amount is
recomputed on the server at the moment of the consequence. As **funder**:
read-only positions and cash. As **debtor**: a public payment page with no
seat required.

**3. Data used.** *Synthetic:* one seed script (`scripts/seed.mts`) creating
7 parties (2 suppliers, 1 funder, 3 debtors, 1 platform), the 5-account
chart, and 6 backdrop invoices spanning every state — the funded and
disbursed ones booked *through* `src/lib/ledger` so the seed cannot place a
movement the invariant module never checked. Names are invented; **no live
data source was connected in any environment, and no real company, person or
registry record appears anywhere.** *Real shapes:* types are generated from
the Drizzle schema in this repo (`src/db/schema.ts`), and this slice writes
exactly the five tables the design's data contract named — `parties`,
`invoices`, `accounts`, `settlement_events`, `ledger_entries` — created in
migration `drizzle/0000_mature_bromley.sql`.

**4. Eval cases.** 1 happy: the spine completes and the ledger balances.
3 edge: double booking refused; funding an unpriced deal refused; role
isolation per seat. 1 boundary: the invariant holds — no stored balance, no
unbalanced movement, no fractional amount.

**5. Eval results.** Run against the working tree at commit `aae8f36` plus
the A5 changes; full record in `evals.md`.

```text
case                expected                      actual                        verdict
1 happy path        spine completes, Σ=0          Chetan's own deal: funding    PASS
                                                  Σ0, disbursement Σ0, snapshot
                                                  locked at 30d/45,900.00
2 double booking    second attempt refused,       state machine refuses; racing PASS
                    one movement only             past it, Postgres refuses —
                                                  one event survives
3 missing terms     refused, nothing books        guard never executed until    PASS
                                                  hardened; then refused with   (hardened)
                                                  0 events, status unmoved
4 role isolation    no cross-seat data            0 occurrences of other seats' PASS
                                                  amounts in full HTTP bodies
5 the invariant     derived balances only         0 unbalanced events, 0 balance PASS
                                                  columns, every entry ever = 0
```

**6. Improvement made.** *Before:* eval case 3 passed without ever running
the code it was meant to test — approval always writes terms, so
`fundInvoice`'s "terms are not set" guard had never executed once. A case
that cannot fail is not evidence. *Change:* integration test 14 now approves
a deal, strips its terms directly in the database, and attempts to fund it.
*After:* refused with the rule named, zero events booked, status unmoved —
the guard is now exercised rather than assumed. (The broader test pass that
preceded the evals produced seven further fixes, listed above.)

**7. Known limitations.** (a) No settlement rail exists: every movement's
evidence is labelled `demo-internal`, and nothing has moved real or testnet
money. (b) No sign-in — seats are chosen freely, which is the demo's design
and the reason cycle 4a exists. (c) Approval is an unassisted human decision;
there is no credit assessment, scorecard or limit behind it until cycles 6–7.
(d) The rates and fees are illustrative — the evals prove the arithmetic is
consistent, never that it is commercially calibrated. (e) Concurrency is
tested only as a single deliberate race against the idempotency key; nothing
here proves behaviour under real parallel load. (f) The branch is unmerged
and undeployed, and the UI's information architecture is a recorded standing
deferral (see `docs/product/CYCLES.md`).

**8. Evidence walkthrough.** Open the app and it asks which of four seats you
are — no account, no password. As the supplier you type an invoice for
48,000.00 against a buyer and submit it; it appears in your book as
`submitted`, and nowhere in Ostrava's. Switch to ops: the deal is at the top
of the review queue. You set the terms and approve. Now the interesting
moment — you press **Fund**, and instead of money moving, a dialog tells you
exactly what is about to happen: funder cash −40,800.00, platform treasury
+40,800.00, **Σ 0.00 — refused otherwise**. Only when you confirm does
anything book. **Disburse** shows three lines, not two, because the
supplier's money and the platform's fees leave the treasury as separate
visible entries. Then the ledger view: four accounts, each balance stamped
*"= SUM(entries) · derived, never stored"*, and every movement carrying its
evidence badge. The boundary moment is visible if you try to skip a step —
press Disburse on a deal that was never funded and it refuses, naming the
rule, and books nothing.

## Final gate (Section D, 2026-09-06)

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             55 tests, 7 files, all passing
npm run build        compiled successfully; 8 routes
smoke path           walked: boots with seat switch · full spine on one
                     invoice (Chetan's, visible in the ledger) · each seat
                     sees only its own surface
data boundary        identity read in one module (src/lib/roles), ledger
                     written in one module (src/lib/ledger) — both verified
                     by grep, recorded as standing invariants in
                     discovery-kit/YOUR_PRODUCT.md
flag off             N/A by design — the foundation IS the host, so there is
                     no flag to turn off; recorded as a decision in design §3
model API key        none exists in this project, by decision (STACK_RULES)
```


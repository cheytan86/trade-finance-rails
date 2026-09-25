# Release — Fiat rail (Circle sandbox, cycle 2)

> **Current decision: NO-GO, with no outstanding condition** — the R0 re-run of
> 2026-09-24 parked this release until cycle 3 slice 2 was built; later the
> same day slice 2 was closed *without* being built, and the condition was
> re-stated rather than left unmeetable. Both are at the end of this file. The
> 2026-09-21 R0 below is kept as the record of what was true then, not edited
> to match.

## R0 — the go/no-go (2026-09-21)

**Decision, Chetan's: NO-GO, UNTIL CYCLE 3 IS FINISHED.**

A parked feature is a completed R0, not a failure. The branch stays unmerged,
the preview stays the public demonstration, and production stays dark.

### X, stated precisely

**Release is revisited when cycle 3 — reconciliation ops — has been built.**

That is not an arbitrary wait. Cycle 2 made settlement asynchronous, and
asynchrony produced a specific set of consequences that cycle 2 deliberately
did not resolve. Four of them are cycle 3's subject matter, and three bear
directly on whether this rail is fit to be in front of anyone:

1. **Inbound payments are matched by amount and arrival window.** A deposit
   has no id until it exists, so it is recognised rather than looked up. Two
   deals of the same face value in flight together are a named refusal —
   correct, but a refusal is not a resolution, and there is no control to
   match a payment by hand.
2. **One deposit is unreconciled right now.** `99bea655` (100.00) was paid by
   a debtor during case 1 and never booked, because of defect 6. The defect is
   repaired; the money is still unmatched, and nothing in the product can
   match it.
3. **An open page never learns that money moved.** `revalidatePath`
   invalidates a server cache; it does not reach a tab someone is already
   looking at. On the immediate rails this could not arise. On a deferred
   rail, someone is watching a screen while the thing they are waiting for
   happens somewhere else.
4. **The value-date question** (see `design.md`, open decisions): today the
   repayment date is when the platform received the money, decided at this R0.
   Cycle 3 should revisit whether a bank-supplied value date can be captured
   and trusted, because the current rule makes the supplier pay for a slow
   bank.

### The evidence this decision rests on

Quoted from `deploy.md` rather than summarised.

A real deal settled end to end on the public deployment:

```text
deal status                     settled
client_collections                  0.00      a conduit, never a beneficiary
debtor_cash · Halvorsen       −18,200.00      face, exactly
funder_cash · Northgate           +195.95      their return
platform_operating                +186.74      the spread
supplier_payable · Amber       +17,817.31      18,200 − 195.95 − 186.74
```

And how each leg finished — the deploy record's own words, *"recorded
precisely rather than summarised favourably"*:

| leg | finished by |
|---|---|
| funding | Check status — after the SNS defect refused Circle's notification |
| disbursement | the gate request — Circle's payout had already completed |
| repayment | a verified delivery, but ambiguous in the records of the day |
| **payout** | **a verified delivery, unattended** |
| residual | the gate request — Circle's payout had already completed |

The three D7 proofs are recorded: the flag off on the real host (404, zero
fiat options, every surface whole), an unauthorized path refused (403 on
unsigned, bogus, and the local-replay key), and production showing nothing
(404 · 107 bytes).

Gate at `67b2842`: **tsc 0 · lint 0 · 194 tests across 16 files · build ✓**.
Evals: **4 pass · 1 partial · 0 fail**.

### The fact that made this decision larger than it looked

**Merging this branch does not release one feature. It releases three.**

```text
main holds 0 application files — no src/, no package.json
this branch is 129 files and 38 commits ahead of main
cycle 2 alone is 55 files and 17 commits
```

Nothing has ever been merged. `main` is still the documentation-only baseline
from cycle 0, held dark deliberately by the Ignored Build Step. So R2 would be
the first time any application code reaches `main`, carrying the foundation,
the USDC rail **and** the fiat rail together, and switching on a production
deployment that has never existed.

Cycle 0's R0 parked at exactly this point, for its own reasons. Waiting one
more cycle means the first production deployment this product ever makes will
carry a settlement story that is finished — a rail that settles asynchronously
*and* the operational machinery for when that goes sideways — rather than half
of one.

### Decisions taken at this R0, recorded in `design.md`

1. **Case 5(b)'s wording: amended** to "a durable row". The PARTIAL grade in
   `evals.md` stands — amending a success criterion does not retroactively
   re-grade the run that found the disagreement.
2. **The repayment date is the date the platform receives the money** — which
   is what the ledger already records, so current behaviour is correct. The
   consequence is recorded rather than hidden: a debtor who pays on time
   through a slow bank is recorded as late, and the supplier's residual bears
   the overdue interest.
3. **The SNS handshake's hand-confirmation is a known limitation, not a
   blocker.** It needs one human click per subscription. That matters only
   where nobody is available, and the trigger to fix it is the first time this
   runs somewhere Chetan is not. Cycle 3 at the earliest.
4. **Four findings deferred to cycle 3**, as listed under X above.

### Standing state while parked

```text
branch        feat/circle-fiat, unmerged, 17 commits, pushed
preview       https://trade-finance-rails-git-feat-circle-fiat-cheytan86s-projects.vercel.app
              — the product's demonstration for the fiat rail
production    trade-finance-rails.vercel.app stays dark: main build-skip on,
              Production env scope empty, 404 · 107 bytes
flag          NEXT_PUBLIC_ENABLE_CIRCLE_RAIL in the Preview scope only
Circle        webhook subscription 56709d33-e17c-45bc-aa1d-5ce1b976fd08 STILL
              LIVE and still delivering to the preview
```

**The live subscription is the one thing this park leaves running.** Deploy's
D9 teardown was scheduled on the trigger "when the preview's purpose is
served". This decision answers that: the preview's purpose is **not** served —
it is the demonstration until cycle 3 closes. So teardown does NOT run now,
and the subscription stays. It must be deleted the moment the preview goes,
or Circle keeps delivering to a URL that has stopped answering.

### Reopening

Invoke `/release` again when cycle 3 is finished. R0 re-runs against
then-current evidence — this decision is a record of what was true on
2026-09-21, not a standing verdict.

---

## Correction (2026-09-21, during cycle 3's Discovery)

**Point 2 under X above is wrong, and is left in place rather than edited.**

It states that one deposit — `99bea655` (100.00) — is unreconciled. Cycle 3's
Discovery reconciled every deposit in the platform's Circle account against
`settlement_events` for the first time:

```text
13 deposits · 10 attributed · 3 unattributed · $50,105.00

    100.00  99bea655  2026-09-18T07:46:29   the one this record names
      5.00  46069659  2026-09-15T10:12:07   not known until 2026-09-21
  50000.00  5ec3e2b9  2026-09-15T09:43:02   not known until 2026-09-21
```

The statement was wrong by $50,005. It was made in good faith: the product
could only ever see the exception it happened to trip over, and no control
existed to ask the account what it held. That is precisely the gap this R0
parked the release on, and the size of the gap is larger than the record knew.

**It changes the decision not at all — it strengthens it.** The no-go stands
on the absence of reconciliation controls, and the absence turns out to have
been hiding more than it was thought to hide.

The two 2026-09-15 deposits are almost certainly artefacts of cycle 2's API
exploration rather than product activity. **Nothing in the product can say so**,
which is the same finding stated a second way.

Detail: `docs/product/reconciliation-ops/discovery.md`, row 5.

### Baseline moved (2026-09-22)

The figures above are as at 2026-09-21. A Virtual Account Number test run
during cycle 3's Design added two deposits on purpose (13.57 and 24.68), and a
second wire bank account that cannot be deleted — Circle exposes no delete
endpoint for them.

```text
2026-09-21   13 deposits · 10 attributed · 3 unattributed · $50,105.00
2026-09-22   15 deposits · 10 attributed · 5 unattributed · $50,143.25
wire accts   fbf1313c (CIR2NV7EX2) · b5ac0172 (CIR3YJPTAG, created 06:18, pending)
```

The new account is `pending`, and `platformInboundTarget()` selects the first
account with `status === "complete"` (`src/lib/rails/circle.ts:66-67`), so the
preview's behaviour is unchanged. That selection is a latent defect either way
— the inbound target is discovered, not configured — and cycle 3's contract
names `circle.ts` for repair.

**Teardown now has two items, not one:** the webhook subscription
`56709d33-e17c-45bc-aa1d-5ce1b976fd08`, and the knowledge that wire account
`b5ac0172` is permanent and will outlive it.

### Production may not be available at all (2026-09-23)

R0 parked production as a **decision**: flag off, build-skip on, revisited after
cycle 3. A reply from Circle Customer Care suggests it may not be a decision.

> "The Circle Mint Account is available only to businesses. This is not
> available for individuals user. To proceed, please reach out to our Sales
> team to discuss your production access, review your business requirements,
> and receive a tailored commercial proposal."

**Production Circle Mint requires a registered business entity and a negotiated
commercial agreement.** Not a signup. So unless this project is carried by such
an entity, **R2 cannot happen for the fiat rail**, and `circle-fiat` is
permanently a sandbox demonstration.

That is not a failure — a demonstration is what this project is for, and the
preview already settled a real deal end to end. It is recorded here so the
release record states a fact rather than leaving a decision pending that nobody
can take.

**What it changes:**

```text
R0 (2026-09-21)   no-go until cycle 3, by choice
now               no-go until cycle 3 AND, beyond that, production access is
                  gated on a commercial agreement outside this repo
sandbox           unaffected. The preview remains the demonstration.
```

**What it does not change:** the go/no-go reasoning, the evidence, the three D7
proofs, or the teardown obligations. Re-run `/release` after cycle 3 as planned;
R0 will simply have one more fact to weigh.

---

# R0, re-run (2026-09-24)

**Decision, Chetan's: NO-GO, UNTIL CYCLE 3 SLICE 2 IS BUILT.**

The 2026-09-21 R0 said *"revisited when cycle 3 has been built."* Cycle 3
slice 1 is built, deployed and recorded. **Slice 2 is not**, and this decision
reads "cycle 3" as the whole cycle rather than the half of it that happens to
close this rail's blockers. The branch stays unmerged, the preview stays the
demonstration, production stays dark.

## X, stated precisely

**Release is revisited when Epic F — remember the sender — is built,
evaluated and deployed**, the same four stations slice 1 went through.

`reconciliation-ops/design.md` carries Epic F as F1–F4 with its own migration
(widening `unique(partyId, rail)` on a live table) and a named demo gap: all
sandbox deposits share one `source.id`, so **slice 2's central behaviour
cannot be honestly demonstrated in sandbox** until that is solved
deliberately. F4 says so in the design, before the code exists.

## The condition the LAST R0 set, measured

Its X named four findings. Two are closed, two were never reached.

```text
1  "there is no control to match a payment by hand"           CLOSED
2  "one deposit is unreconciled… nothing in the product
    can match it"                                             CLOSED
3  "an open page never learns that money moved"               NOT ADDRESSED
4  "the value-date question… whether a bank-supplied value
    date can be captured and trusted"                         NOT REVISITED
```

**Points 3 and 4 return zero hits across every cycle-3 file** — discovery,
design, develop, evals, deploy. They were not deferred with a reason; they
were not reached. That is recorded here rather than quietly dropped, and
**they are not part of this X** — the decision turns on slice 2. They have
been given a home rather than left to be found open a third time:
`CYCLES.md`, *"Two cycle-2 findings that cycle 3 never reached"* — the open-page
problem to the UI and IA revisit after cycle 4, the value-date question to
cycle 6's programme, where a value date is a term of the settlement
arrangement rather than a rail detail.

Point 2 is closed with a receipt, from `reconciliation-ops/evals.md` case 1:

```text
deal a44e9a39 at 'disbursed', repayment leg open for 100.00
deposit 99bea655 — unattributed since it arrived, never booked
deal advanced: disbursed → repaid
unattributed count 11 → 10
```

> *"`99bea655` is the deposit `release.md` named as the product's one known
> orphan. This is the first time anything in the product could resolve it."*

## The evidence laid out at this R0

**Deploy evidence, unchanged since 2026-09-18.** From `deploy.md`, D0:

```text
commit              5026d25
npx tsc --noEmit    0 errors
npm run lint        0 problems
npm test            179 tests, 16 files, all passing
npm run build       compiled; 9 routes
evals               4 pass · 1 partial · 0 fail
```

The three D7 proofs stand, plus a fourth the kit does not require: a real deal
settled end to end on the public internet, with the **payout leg booked by a
verified delivery, unattended**.

**One Deploy item is still open**, and it is quoted rather than glossed —
`deploy.md`, *Outstanding*:

> *"Scope read-back from Chetan as a written confirmation… the dashboard state
> itself has not been read back."*

Cycle 3's Deploy did take that read-back. Cycle 2's never did.

**Production access, restated.** `circle-client.ts:17` defaults to
`https://api-sandbox.circle.com`, so R3 would not be impossible — it would put
the **sandbox** rail in front of production users unless `CIRCLE_API_BASE` is
set, and setting it needs the commercial agreement Circle Customer Care
described. The distinction matters: what is gated is a *real-money* fiat rail,
not the deployment.

**An untouchable module is on this branch.** `src/lib/money/index.ts` was
modified by FIX 4 — the decimal comma that silently multiplied amounts by ten.
Approved at the time and recorded in its commit; it lands on `main` with
everything else whenever this merges.

## The structural fact, sharper than at the last R0

```text
main                        1 commit · 22 files · no src/, no package.json
main → feat/circle-fiat     132 files
feat/circle-fiat HEAD       94a6398 "Cycle 3 discovered and designed"
feat/circle-fiat is an ANCESTOR of feat/reconciliation-ops
```

Merging this branch still releases three features at once. **And the two
branches are now stacked**: releasing cycle 2 would put cycles 0–2 on `main`
and leave cycle 3's code unmerged on top of a merged base. That was not true
on 2026-09-21, and it is the reason "release cycle 3 instead" was a live
option at this R0. It was not taken.

**Nothing is stale.** `main` is an ancestor of the branch and has not moved
since 2026-09-06, so R1's merge-main-into-branch would be a no-op. The
manifest reconciles against its own base (`feat/settlement-usdc..feat/circle-fiat`,
59 files); it cannot be reconciled against `main`, which holds no application
code to diff.

## Standing state while parked (unchanged, re-verified 2026-09-24)

```text
branch        feat/circle-fiat, unmerged, 19 commits, pushed
preview       https://trade-finance-rails-git-feat-circle-fiat-cheytan86s-projects.vercel.app
production    trade-finance-rails.vercel.app stays dark — 404 · 107 bytes,
              re-proved at cycle 3's Deploy on 2026-09-24
flag          NEXT_PUBLIC_ENABLE_CIRCLE_RAIL in the Preview scope only
Circle        webhook subscription 56709d33-e17c-45bc-aa1d-5ce1b976fd08 STILL
              LIVE, still delivering to THIS preview
wire acct     b5ac0172 (CIR3YJPTAG) permanent — Circle exposes no delete
```

**The live subscription is now a cross-cycle fact, not just this one's.**
Cycle 3's Deploy recorded it as finding 3: the cycle-2 preview keeps booking
into the shared database, so a payment can vanish from cycle 3's queue with
nothing on cycle 3's preview having done it. This park keeps that true. It is
the price of holding cycle 2's preview as the demonstration, and it is paid
knowingly.

## Reopening

Invoke `/release` again when Epic F is built, evaluated and deployed. R0
re-runs against then-current evidence. This decision records what was true on
2026-09-24; it is not a standing verdict.

---

## X re-stated, the same day (2026-09-24)

**The condition above became unmeetable within hours of being set, and is
replaced rather than quietly abandoned.**

Slice 2's own Gate 0.5 measured F4's demo gap and found Epic F's premise does
not hold: **`source.id` identifies the platform's own receiving Virtual Account
Number, not the payer.** 24 deposits carry 2 distinct values and both are our
own registered wire accounts, so a rule learned on that field remembers which
of our mailboxes the money arrived in. Chetan's decision, taken on that
measurement: **do not build slice 2.** Full reasoning and the worked example:
`docs/product/reconciliation-ops/develop-2-epic-f.md`.

**"No-go until slice 2 is built" would therefore have parked this release on a
condition nobody intends to meet** — which is not a park, it is a quiet
abandonment wearing a park's clothes.

### The replacement

**X: release is revisited when cycle 3 is closed** — which it now is.

```text
slice 1     built · evaluated 5 pass · 0 partial · 0 fail · deployed 2026-09-24
Epic F      designed and deliberately NOT built, with the measurement that
            stopped it recorded rather than the gap left unexplained
cycle 3     CLOSED
```

**This does not make the release a go.** It returns `circle-fiat` to an
ordinary R0 with **no outstanding condition**. The next `/release` run weighs
the evidence fresh, and three things will still be on the table:

1. The two findings cycle 3 never reached — the open page that never learns
   money moved, and the value-date question — now homed in `CYCLES.md` against
   the UI revisit and cycle 6 respectively.
2. Production Circle Mint requiring a registered business entity and a
   negotiated commercial agreement.
3. The structural fact that merging this branch releases three cycles at once,
   and that `feat/circle-fiat` is an ancestor of `feat/reconciliation-ops`.

**The distinction this re-statement preserves: satisfying a condition is not
the same as deciding to ship.** Removing the condition hands the decision back
to the person who has to make it, rather than making it for them by leaving a
gate nobody can open.

### A new fact for the next R0, found while measuring the above

`platformInboundTarget()` (`src/lib/rails/circle.ts:69`) selects
`accounts.find(a => a.status === "complete")`. Wire account `b5ac0172` was
`pending` when cycle 3's design was written and is now `complete` and listed
first, so **the platform is currently telling debtors to wire to the account
created for a test.** Nothing is broken — inbound matching is on amount and
arrival window, not on the account — but the design named this a latent defect
and it has now fired, caught only by a measurement taken for another purpose.
It belongs on the next R0's evidence, and its repair trigger is recorded in
`CYCLES.md`.

---

# R2 — executed, and reverted within the hour (2026-09-24)

**The release was carried out exactly as approved, and undone forty minutes
later. Both halves are recorded, because the second half is the part worth
having.**

```text
merge       feat/circle-fiat → main, --no-ff, all flags off
            main: 1 commit / 22 files  →  43 commits / 146 files
            merged tree byte-identical to the branch R1 gated green
push        58865cb, 42 commits, after a second written approval
production  404 → 200 at about 40 seconds
smoke       FAILED. See below.
revert      dda04de, pushed
            main: back to 22 files
production  STILL 200/500 — the revert did not reach it
deployment  deleted from the Vercel dashboard by Chetan
production  404 · 107 bytes on every path. Dark again.
```

## Two assumptions this project had held since cycle 0, both wrong

```text
ASSUMED   "the Ignored Build Step holds production dark"
ACTUAL    main built and deployed 40 seconds after the push

ASSUMED   "reverting main restores the 404"
ACTUAL    main without application code cannot be built, so Vercel kept
          serving the LAST SUCCESSFUL deployment — the broken one
```

**What had actually kept production dark for three weeks was that `main`
contained no application code.** Neither named mechanism was doing the work
the records credited to it. Every deploy record from cycles 0, 1, 2, 3 and 4
states the build step as the control; all five are wrong on that point, and
none of them could have known, because production had never been asked to
serve anything.

## What the smoke path found

```text
/                200   the landing page — no query
/supplier        200   with an ops cookie: the gate card, no query
/funder          200   same
/ops             500
/ops/ledger      500
/pay             500
```

**The Production env scope is EMPTY** — read back twice on the day — and
`src/db/client.ts:9` throws when `DATABASE_URL` is unset. So every page that
queries returned 500 and every page that does not returned 200.

**An empty scope is not only safe, it is also non-functional, and those are the
same fact seen from two sides.** Every record until today celebrated the first
half without anyone noticing the second, because nothing had ever run there.

## The half that worked exactly as designed

```text
circle / fiat mentions on /ops     0
/ops/payments link                 0
rail comparison heading            0
POST /api/webhooks/circle          404 — the route does not exist with the
                                   rail off
```

**Flag-off held perfectly.** Nothing flagged became visible, on a live
production domain, which is the strongest form that proof has ever taken here.

## And one consequence worth carrying to R3

**The no-cookie hole was INERT in production.** `gate.tsx:22` lets a request
with no cookie through, and on the previews Vercel's login stops it. In
production there is no such login — but there was also no database, so
`/ops/ledger` returned 500 rather than 144 KB.

**It cannot leak a ledger it cannot read.** That protection disappears the
instant a `DATABASE_URL` is added to the Production scope, which is why adding
one must be a deliberate decision with `gate.tsx` fixed first, rather than a
fix for a broken-looking page.

## Where this leaves the release

**The DECISION stands. Only its execution was reversed.**

```text
R0        GO — unchanged. The condition was met and Chetan took it.
R1        green, and still green — the branch is untouched
R2        attempted, reverted. Not a failure of the branch: the branch
          built, served, and hid every flagged feature correctly.
          What failed was an environment nobody had ever exercised.
R3        not reached
```

**What R2 must do differently next time**, in order:

```text
1. fix gate.tsx:22 — a missing cookie must be a missing seat.
   Owner: cycle 4a. This is now a PRECONDITION of R2, not of R3,
   because the app needs a database to serve at all.
2. add DATABASE_URL to the Production scope BEFORE merging, not after —
   an empty scope is a broken deployment, not a dark one
3. decide what production should serve while flags are off, and prove it
   on a preview first — the cycle-0 spine on demo-internal is a real
   product and should look like one
4. know how to make production dark again. Deleting the deployment is
   the only mechanism that worked today, and it is a dashboard action.
```

**A rollback recorded honestly is the process working.** The alternative was a
release record that said "merged, flags off, production untouched" — which
would have been true of the merge, false of the deployment, and would have left
two wrong assumptions in place for cycle 5 to trip over.

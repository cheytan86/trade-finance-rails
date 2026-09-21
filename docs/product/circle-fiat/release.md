# Release — Fiat rail (Circle sandbox, cycle 2)

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

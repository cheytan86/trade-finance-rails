# Discovery — Reconciliation ops (matching inbound payments)

Date: 2026-09-21 · Verdict at Step 2: **go**, reshaped from "match a payment by
hand" — the grill widened it from one control to the five exceptions
`CYCLES.md` row 3 already committed this cycle to, and narrowed it by moving
reversals out to a cycle of their own.

This is cycle 3. Release of the fiat rail (cycle 2) is blocked on it: cycle 2's
R0 recorded **NO-GO until cycle 3 is finished**, naming "there is no control to
match a payment by hand" as the first of its reasons
(`docs/product/circle-fiat/release.md`).

---

## 1. User

**Ops**, on a new screen under `/ops`, at the moment they need to answer a
question the product cannot currently answer: *what money has arrived, and what
is it for?*

Ops is the only seat that sees across all parties. The four seats are
`supplier · ops · funder · debtor` (`src/lib/roles/parse.ts:6`) — there is no
risk or treasury seat, and this cycle does not add one. A supplier must not see
another supplier's payments; a funder must not see a debtor's. So the screen is
ops-only, and that is a property of the seat model rather than a choice made
for this feature.

The situation is specific: money has landed in the platform's Circle account
and no deal has claimed it. Today ops finds this out by someone running a
`curl` against Circle's API, or by not finding it out at all.

## 2. Workflow

1. Ops opens the reconciliation queue and sees every payment that has arrived
   in the platform's account, whether or not the product expected it.
2. For each one, ops reads what came with the money: the amount, when it
   landed, and who sent it.
3. The screen shows any open legs that could plausibly be what the money is
   for, and how much each still has outstanding.
4. Ops does one of four things:
   - **matches** it to a leg, in full;
   - **part-matches** it, applying what is there and leaving the remainder in
     an unapplied account;
   - **picks between candidates**, when more than one leg fits, after
     establishing which is correct off-platform;
   - **leaves it**, when nothing fits, so it stays visible and ages.
5. On a match, the ledger books the movement through the existing sole writer
   and the deal advances to whatever its booked legs now justify.
6. What ops did, and why, is recorded against the payment — including the
   off-platform confirmation, when the decision rested on one.

## 3. Trigger

Money arrives in the platform's Circle account and nothing in the product
claims it.

That happens in four ordinary ways, none of them exotic:

- the payer quoted no reference, or a wrong one;
- the amount differs from what was expected, because it is a part payment;
- two deals are open for the same amount and the payment cannot be told apart;
- the payer is nobody the product knows.

There is no schedule and no queue depth that starts this. A single unclaimed
payment is the trigger, because a single unclaimed payment is client money the
platform cannot attribute.

## 4. Current process (in the app today)

**The product does nothing. It does not even record that the money arrived.**

The only inbound matching that exists is `matchInboundDeposit()`
(`src/lib/rails/verify-circle.ts:82`). It is pull-based and per-leg: it runs
only because one specific pending leg asked "has *my* money arrived?", and it
filters Circle's deposit list to an exact amount within a window starting when
that leg was initiated. Its three outcomes are:

- exactly one match → the leg settles;
- no match → `pending`, which is normal and means "not yet";
- two or more matches → it throws `rail-ambiguous-match`
  (`src/lib/rails/verify-circle.ts:105`), booking nothing.

Every deposit that is not the one being looked for is **discarded in memory**.
Nothing is written down. The full deposit list is already fetched on every
status check (`src/lib/rails/circle.ts:154`) and then thrown away.

So four of the five exceptions are not "unhandled" — they are **invisible**. A
part payment does not match an exact amount. A payment from before the leg
opened is filtered out by the window. A payment for no open deal matches
nothing. The ambiguous case is recorded — corrected at Design Step 1.0,
2026-09-21: the throw is caught by `completeSettlement`
(`src/lib/settlement/pending.ts:242-249`), which writes the reason to
`pending_settlements.failure_reason` and renders it on the deal page via
`src/components/in-flight-strip.tsx:44`. It is not lost. But it is recorded
**against the deal**, so it can only be found by someone who already knows
which deal to open — and money belonging to no deal has no page at all.

The three ops routes that exist — `src/app/ops/page.tsx`,
`src/app/ops/ledger/page.tsx`, `src/app/ops/deals/[id]/page.tsx` — show deals
and ledger entries. None of them shows money received.

**Off-platform:** the work is done by a person with the Circle API key and a
terminal, who knows the deposits endpoint exists. That is not a process; it is
one person's knowledge.

## 5. Pain / gap

Measured against the live Circle sandbox account on 2026-09-21, by listing every
deposit and reconciling it against `settlement_events`:

```text
13 deposits total · 10 attributed to a ledger event · 3 unattributed

    100.00  99bea655  2026-09-18T07:46:29   no ledger event
      5.00  46069659  2026-09-15T10:12:07   no ledger event
  50000.00  5ec3e2b9  2026-09-15T09:43:02   no ledger event

unattributed value: $50,105.00
```

**The product's own written record said there was one unattributed deposit
worth $100.** `docs/product/circle-fiat/release.md` states it as fact, and that
statement was the basis of a go/no-go decision. It was wrong by $50,005 — not
through carelessness, but because **there was no way to check**. The product
could only ever see the exception it happened to trip over.

That is the gap in one sentence: *the platform cannot say what money it holds.*

Two further facts found while checking, both of which shape the build:

- **The reference does not survive.** `createMockWire` sends
  `memo: req.idempotencyKey` (`src/lib/rails/circle.ts:126`), and Circle's
  deposit record returns nine fields — `amount · createDate · destination ·
  fromAmount · id · source · sourceWalletId · status · updateDate`. There is no
  memo, no tracking reference, and no reference field of any kind. Matching
  here cannot depend on a reference the payer quoted. *(Circle's production
  payload may carry more; unverified, and worth confirming at Design.)*
- **A stuck deal and its money are both sitting there.** Invoice `353a4c79` is
  at status `disbursed` with a face value of 100.00, waiting for a repayment.
  Deposit `99bea655` is 100.00 and unattributed. Defect 6 in cycle 2 separated
  them. Nothing in the product can reunite them.

## 6. Opportunity

A reconciliation queue under `/ops` that lists every payment the rail has
received, lets ops attribute each one, and books the result through the ledger
that already exists.

**This is all product work. No agent.** The judgement ops applies is not
document reading or policy inference — it is arithmetic and identity, and the
product should do the arithmetic and let ops do the identity. Matching is on
**exact sender account id and exact amount**. Explicitly rejected: fuzzy name
matching, similarity scoring, any model call. The sender name Circle returns is
a bank-formatted string (`"WELLS FARGO BANK, NA ****0010"`); matching on it is
guesswork, and guesswork that books money is what this product has refused
since cycle 0.

The one place learning appears: when ops attributes a payment from a sender the
product has not seen, that binding is remembered, so the next payment from the
same account arrives **pre-matched as a suggestion**. Ops still confirms. The
alternative — remembering and booking automatically — was considered and
rejected at Discovery, because nobody authorised *that* payment, only a
resemblance to a previous one, and `src/app/api/webhooks/circle/route.ts:18-21`
states that nothing probabilistic may sit on the booking path.

## 7. Data plan

**Real tables, all existing:**

- `pending_settlements` (`src/db/schema.ts:276`) — the open legs a payment
  could be for, with the amount each expects.
- `settlement_events` (`src/db/schema.ts:180`) — what gets written on a match.
  Its unique index `settlement_events_circle_payment_once`
  (`src/db/schema.ts:205`) already enforces that one Circle payment id settles
  one leg once; manual matching must land on that same guard rather than
  route around it.
- `ledger_entries` (`src/db/schema.ts:230`) and `accounts`
  (`src/db/schema.ts:162`) — written only through `src/lib/ledger/index.ts`,
  which is the sole writer. This feature adds no second writing path.
- `settlement_destinations` (`src/db/schema.ts:334`) — maps
  `partyId + rail → externalId`. Built for paying money out; read backwards it
  identifies money coming in.
- `parties`, `invoices`, `webhook_deliveries`.

**Schema changes required:**

1. **A new `account_kind` value: `unapplied`.** The enum
   (`src/db/schema.ts:72`) has six values and none of them can hold money that
   has arrived but is not yet attributed. `grep -i unapplied` across `src/` and
   `drizzle/` returns zero hits, while `PRODUCT_PAPER.md` names unapplied cash
   three times as an assumed capability. Adding an enum value is additive.
2. **A register of source accounts.** Which external bank account belongs to
   which party. `settlement_destinations` is most of this already.
3. **Widening `unique(partyId, rail)`** on `settlement_destinations`
   (`src/db/schema.ts:349`). Today a party may have exactly one account per
   rail, so a debtor who pays from a different account than they are paid at
   cannot be represented. Dropping a uniqueness restriction cannot invalidate
   existing rows, but it is a migration against a live table and goes in the
   design contract explicitly.

**A new rail capability.** `listInbound()` alongside `prepare` / `execute` /
`verify` (`src/lib/rails/types.ts:118-122`). `circle-fiat` implements it with
the existing `listDeposits()` (`src/lib/rails/circle-client.ts:149`).
`demo-internal` and `usdc` **declare it unsupported** — on the USDC rail the
platform holds every demo wallet's key and signs as the counterparty
(`src/lib/rails/usdc.ts:78`), so no payment ever arrives from outside and there
is nothing to reconcile. The screen must say *"this rail has no inbound
payments"* rather than render an empty list, which would read as *"no money
arrived."*

**Where the list comes from, and why.** From the rail, not from
`webhook_deliveries`. The delivery log's earliest row is 2026-09-18T06:03:46;
two of the three unattributed deposits arrived on 2026-09-15. A list built from
deliveries cannot show them — not "is unlikely to", cannot, by construction.
Cycle 2 also proved the log can be silently incomplete: the SNS defect refused
every genuine notification until Deploy found it. A reconciliation screen that
can be quietly wrong is worse than none, because ops will trust it.

**Synthetic fixtures.** In sandbox the platform creates every deposit itself
(`POST /v1/mocks/payments/wire`, `src/lib/rails/circle-client.ts:176`), so all
13 carry an identical `source.id` and an identical sender name. Two consequences:
a realistic mess has to be **staged deliberately** rather than waited for; and
the learned-sender suggestion cannot be honestly demonstrated in sandbox, since
every deposit would suggest the same party. The eval fixtures must create
deposits that differ in amount and timing on purpose, and the demonstration of
suggestions has to be designed around the collision rather than assume it away.

## 8. Human boundary

**Never without ops confirming on screen:**

- book any payment to any leg — every attribution is a person's decision;
- act on a learned sender rule; a remembered sender produces a **suggestion**,
  never a booking;
- choose between two candidate legs; the screen presents both and refuses to
  rank them.

**Never at all:**

- **return money to a sender.** "Resolve it with the sender" may mean sending
  it back, and that is an outbound payout to an account with no registered
  destination, on the say-so of whoever claims the money is theirs. It is the
  most attractive thing on this screen to an attacker. Unattributable money is
  parked, not returned. Returning money is its own feature with its own
  approval path.
- **apply more than what is outstanding.** A leg expecting 100.00 with 60.00
  already booked accepts 40.00 and refuses 50.00. Note this is a *different*
  guard from the one that exists: before part payments, "has this leg settled?"
  was a yes/no question; with them it is an amount, and getting it wrong in
  either direction is a money defect.
- **spend one deposit twice.** One payment settles one thing, once. Enforced in
  the database, not only by a disabled button — a disabled button does not stop
  a double submit, a stale tab, or two people working the queue at once.
- **attribute money to a settled deal.** There is nothing left for it to pay.
- **amend a deposit.** Circle's record is the record; ops attributes it and
  does not edit it.
- **un-match something already booked.** Once booked, booked.

## 9. Success metric

**Every payment the platform has received is either attributed to a deal or
visibly unattributed with an age and an owner. Nothing is invisible.**

Today that is **10 of 13**. The target is 13 of 13.

The split between the two states is deliberately *not* the metric. Driving
unattributed value to zero would be the wrong target: deposit `5ec3e2b9`
($50,000) matches no face value on the rail and should stay unattributed, and a
product that pushes that number down is a product that forces bad matches. How
the 13 divide is ops's judgement. That all 13 are accounted for is the
product's job.

The secondary measure, which the evals test: **no payment is ever booked
twice, and no payment is ever booked for more than is outstanding** — on the
happy path and under a double submit.

## 10. Demo idea

The demo will show **[an unattributed $100 payment and a deal stuck waiting for
exactly $100]** → **[the queue showing sender, amount, arrival time, and the
open legs it could belong to]** → **[ops matching it, and separately part-
matching, choosing between two candidates, and leaving one alone]** →
**[the ledger booking the movement, the stuck deal advancing past `disbursed`,
and the queue dropping by one]** → **[$50,000 that matches nothing staying on
the screen, unbooked, with its age and its owner]**, on screen at the new
`/ops` reconciliation route.

The opening case uses **real data already in the account** — invoice `353a4c79`
at `disbursed`, deposit `99bea655` unattributed, the pair cycle 2's defect 6
separated. Nothing is staged for it. The closing case is also real: `5ec3e2b9`
genuinely matches nothing and stays that way, which is what proves that
"leave it" means *visible and owned* rather than *forgotten*.

---

## Boundary — explicitly out of scope (agreed at Step 2)

| Out | Why |
|---|---|
| Bulk actions across many payments | 13 rows today; it multiplies the blast radius of a mistake to solve a volume problem that does not exist |
| CSV / bank-statement import | The rail capability *is* the import; a second source of truth about what arrived reintroduces the exact ambiguity this removes |
| USDC inbound | No payment ever arrives from outside on that rail; building a log indexer turns a reconciliation cycle into an indexing cycle |
| Notifications and alerts | Aging gives the queue and the clock; delivery is its own problem with its own failure modes |
| A risk seat | `SEATS` is four values (`src/lib/roles/parse.ts:6`); adding one is an auth change, and invoice-fraud review is cycle 8's declared subject |
| Returning money to a sender | See row 8 — a new fraud surface, and the most attractive one on this screen |
| Un-matching a booked payment | Reversal-adjacent; belongs with reversals |
| Editing a deposit | Circle's record is the record |
| Cross-rail matching | A Circle deposit settling a `demo-internal` deal is nonsense, but someone will ask |

## Deferred to later cycles

**Reversals, entirely — their own cycle, with credit loss.** `CYCLES.md` row 3
names reversals as part of cycle 3, and Discovery moved them out. Two reasons.
They need contra-entry machinery inside `src/lib/ledger`, the sole writer and
the most constrained code in the repo, and a booked deal would have to move
backwards through `src/lib/domain/states.ts`, which is untouchable and whose
line 3 already says *"The full machine (matured-unpaid, holds, reversals) is
later-cycle design."* And they **cannot be honestly evaluated here**: a sandbox
deposit is never clawed back, so any eval would be a fiction written by the
same person it is meant to test. The hard case — money reversed *after* it has
been paid out to funder and supplier — is not a matching problem at all. It is
a credit loss: `client_collections` would go negative, breaking the
nets-to-zero property cycle 2 verified, and the platform would need a
receivable account it does not have.

**A three-account restructure — cycle 10.** Proposed at Discovery: separate
Disbursement, Repayment and Cash accounts. Not taken this cycle. It does not
solve this feature's problem (all three hold money that *is* attributed; this
feature is about money that is not), it is not additive (every ledger entry
ever written references the current account kinds), and cycle 10 is already
*"facility escrow + client-money segregation"* — the cycle where account
structure belongs, alongside the escrow that justifies the migration and the
daily proof that tests it. Cycle 2 also just verified that `client_collections`
nets to exactly zero at every stage, which *is* the segregation claim; splitting
it does not strengthen it. Recorded here as a decision waiting, not an idea lost.

**Overpayment.** Same machinery as part payment — take it if it falls out
free, do not design for it.

**Supplier self-payment fraud — cycle 8.** Raised at Step 2: a supplier paying
against their own fake invoice. It needs invoice verification, which is cycle
8's declared subject, and a risk seat, which is an auth change.

**Failed sanctions screening.** Named in `CYCLES.md` row 3, but nothing in the
roadmap builds screening before cycle 6. It cannot be handled before it can
happen.

## Five candidate eval cases (input to Design)

Agreed at Step 2; Design owns the final wording and the pass criteria.

1. **Positive, end to end.** `353a4c79` sits at `disbursed`; `99bea655`
   ($100) sits unattributed. Ops matches it. **Pass:** the ledger books the
   repayment, the deal advances past `disbursed`, the queue drops by one.
   **Fail:** it books but the status does not move.
2. **Part payment.** A deposit smaller than the open leg expects. **Pass:** the
   deal shows partially repaid, the remainder sits in `unapplied`, and
   `client_collections` still nets to zero. **Fail:** it books the full amount,
   refuses outright, or the books stop balancing.
3. **Ambiguous.** Two open legs want the same amount; one deposit arrives.
   **Pass:** both candidates are shown, neither is suggested, ops picks, and the
   record captures who decided and on what basis. **Fail:** the product picks
   one.
4. **No target.** `5ec3e2b9` ($50,000) matches nothing and never will.
   **Pass:** it stays visible and unbooked, with an age and an owner. **Fail:**
   it is invisible, forced onto something, or ages into nowhere.
5. **The refusal.** The same deposit applied twice, and a deposit applied to a
   settled deal. **Pass:** both refused, with a named reason on screen, nothing
   booked — and the refusal holds at the server, which is the layer a race can
   reach. **Fail:** either one books, or it fails with an error ops cannot act
   on.

## Weight test (PROCESS_GUIDE.md)

```text
model calls    no    exact source.id + exact amount; deterministic throughout
money          YES   it books settlement legs through the ledger
schema         YES   unapplied account kind · source-account register ·
                     unique(partyId, rail) widened
auth           no    no new seat
many files     YES   rail interface + all three rails · ledger · a new ops route
```

**FULL track.** Three of five, including both heavy ones.

## Recommendation carried to Design

**Two slices**, for Design's build-order decision to confirm or reject:

```text
slice 1   see the money · match by hand · part payment · ambiguity · aging
          → resolves the $50,105 on its own; complete and demonstrable alone
slice 2   the source-account register · learned senders · suggestions
          → needs the migration; useless until slice 1 exists
```

Cycle 2 was 55 files and 17 commits and produced eight defects with less scope
than slice 1 and slice 2 combined.

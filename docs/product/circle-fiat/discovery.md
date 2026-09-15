# Discovery — Fiat rail (Circle sandbox)

Date: 2026-09-15 · Cycle 2 · Verdict at Step 2: **go**, reshaped from
"cycle 2" (an area) into one feature with a conditional second slice.

> **SUPERSEDED IN PART, 2026-09-15 — read this first.** The conditional
> second slice (hybrid mode) was removed later the same day, during Design.
> The reasoning below frames hybrid as conditional on *Circle's sandbox
> capability*; that was the wrong question. The blocker is this repo's data
> model — `invoices.rail` is one column per deal, and hybrid is two rails
> inside one deal. Hybrid now lands in cycle 6 as a **programme type**, with
> the settlement arrangement carried by the supplier × buyer RPA. The rest of
> this file stands. See `design.md` §2 and `docs/product/CYCLES.md`,
> "The programme".

**Weight test (PROCESS_GUIDE):** model calls no · moves money **yes** ·
schema changes **yes** · auth **yes** (the first unauthenticated write path
this app has ever had) · many files **yes**. Four of five → **FULL track**.

**Scope decided with Chetan, 2026-09-15.** The cycle is the fiat rail with
asynchronous settlement done honestly. **Hybrid mode (the conversion legs
2a/3a) is a second slice, conditional** on the Circle sandbox actually
supporting the conversion once the account is funded — if it does not,
cycle 2 still ships a complete all-fiat mode and hybrid moves to cycle 3,
where `docs/product/CYCLES.md` originally placed it. The alternative
considered and rejected: committing to both up front, which would put the
whole cycle's completion at the mercy of an unverified sandbox capability.

One framing correction made during Step 1, recorded because it changed the
question: "async settlement" was briefly offered as an *alternative* to
hybrid. It is not an alternative to anything — `CYCLES.md` already defines
this cycle as "async settlement, webhook signatures, idempotency,
out-of-order delivery", and Circle forces it regardless of which modes ship.

---

## 1. User

**Platform ops, at stage 3 (Settlement) of a deal priced on the `circle-fiat`
rail**, pressing a money gate — Fund, Disburse, Pay out, or Pay residual — on
`/ops/deals/[id]`. Today every such press either books instantly or refuses;
on this rail it will do neither, and ops has to be told something true about
a leg that is neither done nor failed.

Two secondary users feel it without acting: the **supplier**, whose
disbursement now takes bank-transfer time rather than appearing, and the
**funder**, whose payout does the same. The **debtor** is unchanged — they
already pay at a public link.

## 2. Workflow

1. Ops prices a deal and selects the **fiat rail** (the rail picker already
   exists on the pricing form; this adds a third option).
2. Ops presses a money gate. The confirm dialog shows the same exact ledger
   entries it shows today, plus — new — that this rail settles later and
   roughly when.
3. Ops confirms. The platform calls Circle, gets back a payment or payout id
   and a status of `pending`. **Nothing books.**
4. The leg shows as **in flight** on the deal page, the ops queue, and the
   ledger — visibly not settled, with the Circle id as its reference.
5. Minutes or hours later Circle sends a webhook. The platform verifies its
   signature, re-reads the payment from Circle's API rather than trusting the
   webhook body, and — if it confirms — books the ledger entries and advances
   the invoice state. Unattended.
6. If Circle reports the payment **failed**, the leg books nothing, returns
   to un-settled, and surfaces as an exception with Circle's own reason.
7. Repeat per leg. A deal may have legs on this rail in flight while other
   legs have already settled.

## 3. Trigger

Two, and the second is the one that is new to this product:

- **Ops confirms a money gate** on a deal whose rail is `circle-fiat`.
- **A webhook arrives from Circle**, unprompted by any user, at any hour,
  possibly twice, possibly out of order, possibly forged. Every write path
  in this app today begins with a person clicking something. This one does
  not.

## 4. Current process (in the app today)

**There is no fiat rail.** `RailId` is a closed union of two —
`"demo-internal" | "usdc"` (`src/lib/rails/types.ts:16`) — and the registry
that resolves a deal's stored rail to an implementation has two entries
(`src/lib/rails/index.ts:9-12`). Fiat legs do not exist; the all-fiat and
hybrid modes in `PRODUCT_PAPER.md` §5 are paper only.

**Cycle 0 and 1 anticipated this cycle in three places**, which is why it is
additive rather than a rewrite:

- `evidence_kind` already admits `'circle-payment-id'` and
  `'statement-line'` (`src/db/schema.ts:72-77`), with the comment "the other
  kinds are declared now so cycles 1–3 add rows, not columns".
- `RailActor`'s contract says the rail maps actors to its own addressing,
  "a wallet, later a bank account or a Circle wallet id"
  (`src/lib/rails/types.ts:19-21`).
- `VerifiedTransfer.explorerUrl` is already optional, "absent for off-chain
  rails" (`src/lib/rails/types.ts:57-58`).

**What the app does instead, and what collides.** Five findings, each from
the file:

1. **Settlement is synchronous by construction.** `settleThroughRail`
   (`src/lib/deals/actions.ts:59-69`) runs `execute → verify → bookMovement`
   in one function call, then compare-and-swaps the invoice status. Circle
   cannot answer `verify` inside that call — `execute` returns `pending`.
   The seam's four moves survive; the *sequencing* does not.

2. **There is nowhere to record "initiated but not settled."**
   `settlement_events` has no status column (`src/db/schema.ts:150-173`) —
   the existence of the row *is* the settlement — and `ledger_entries`
   references `event_id` (`src/db/schema.ts:193-196`), so entries cannot
   exist without one. An in-flight leg must therefore live somewhere that
   is not a settlement event, or the ledger acquires entries for money that
   has not moved.

3. **The invoice status enum has no pending states**
   (`src/db/schema.ts:28-45`), and adding one per leg would add five states
   to a nine-state machine. Cycle 1 set the precedent for the alternative:
   overdue-ness is "a display condition off the due date, not a state"
   (`PRD.md` §2). Whether in-flight follows that precedent is Design's
   call, named here so it is decided rather than drifted into.

4. **The double-settlement guard does not cover Circle.** The unique index
   `settlement_events_tx_hash_once` is deliberately partial —
   `where evidence_kind = 'tx-hash'` (`src/db/schema.ts:167-172`). A Circle
   payment id gets no such protection today, and with webhooks delivering
   more than once it needs its own.

5. **The `wallets` table cannot hold a bank account.** Every row is keyed by
   `chain_id`, not null (`src/db/schema.ts:177-191`), and both its unique
   constraints include it. Circle wallet ids and bank accounts have no chain
   id and need their own home.

**No route handlers exist.** `find src -name "route.ts"` returns **0**, and
`discovery-kit/YOUR_PRODUCT.md:67-68` records that as deliberate — "none by
design — server actions do the writes". The webhook endpoint is the first,
and it is public.

**Off-platform today:** nothing. Fiat settlement in this product is not done
manually, it is simply absent — which is why the product currently
demonstrates a blockchain settlement system rather than a payments system.

## 5. Pain / gap

The product's headline claim is that **the settlement rail is a priced
decision**. With one real rail there is no decision — the comparison screen
at cycle 4 would compare USDC against a rail that books instantly and
costlessly because it is a fiction (`demo-internal`).

More sharply: the rails differ in the way that actually matters commercially,
and the app currently cannot express the difference. USDC settles in seconds
with cryptographic proof. A wire settles in hours or days, through a party
that can change its mind, and the proof is somebody else's database. A
system that can only model the first has not modelled payments — and every
downstream cycle inherits that. Reconciliation (cycle 3) has nothing to
reconcile without a rail that produces unmatched and late money.

There is also a correctness gap that only appears on this rail: the moment
settlement is asynchronous, **the ledger can disagree with reality for a
window of time**, and the app has no vocabulary for that window. Cycle 0
defined the colour for it — `--flight #B45309`, "initiated-not-settled,
HOLLOW + DASHED treatment" — and `design-kit/DESIGN_SYSTEM_NOTES.md:51-53`
records that it is "nearly idle" with pending transactions as "its intended
tenant". The design anticipated this cycle and has been waiting for it.

## 6. Opportunity

A third settlement rail, `circle-fiat`, behind the existing seam — plus the
asynchronous settlement machinery the seam does not yet have: an in-flight
record, a signed webhook endpoint that re-reads rather than trusts, idempotent
and order-independent booking, and a failure path that un-flights a leg
without inventing a ledger entry.

**Slice 2, conditional: hybrid mode.** The funder pays in USDC, the platform
converts, the supplier receives fiat — the paper's legs 2a/3a. Built only if
the funded sandbox supports the conversion. Its interest is that one
supplier payment becomes two chained asynchronous operations, either of which
can stall — the first multi-step settlement the ledger has seen.

**Agent or product: PRODUCT, plainly.** There is no judgment here a rule
cannot make. A webhook signature either verifies or does not; a payment
status is a value Circle returns; a duplicate delivery is caught by a unique
constraint. Putting a model anywhere near this would cost money and honesty
and buy nothing. (Reconciliation's *ambiguous match* exception, cycle 3, is
the first place in this product where that question is even worth asking.)

## 7. Data plan

**Real tables involved** (`src/db/schema.ts`): `invoices` (the `rail` column
and its enum gain a third value), `settlement_events` and `ledger_entries`
(unchanged in shape — the in-flight record must not pollute them),
`accounts`, `parties`, `wallets` (cannot serve; see §4 finding 5).

**Expected additions**, each to be re-approved in Design before it is
written:

- A record of an **in-flight leg**: which invoice, which leg type, which
  rail, the rail's own id, the amount, when it was initiated, its last known
  external status. Its unique key is the same `type:invoiceId` idempotency
  key the ledger already uses (`src/lib/deals/actions.ts:51`), so a leg can
  never be in flight twice.
- A **destination registry** that is not chain-keyed — Circle wallet ids and
  bank account ids per party.
- A **webhook delivery log**, so out-of-order and duplicate deliveries are
  provable rather than asserted, and so a forged one is recorded as refused.
- `evidence_kind = 'circle-payment-id'` gains its own uniqueness guard,
  mirroring `settlement_events_tx_hash_once`.

**The segregation rule lands this cycle.** `docs/product/CYCLES.md` records
the standing decision (Chetan, 2026-09-07, from the bankruptcy-remoteness
challenge): from the fiat-rail cycle onward, client money never shares an
account or a wallet with platform funds, and "the cycle-1 conduit treasury is
the last cycle allowed to commingle". `account_kind` today has
`platform_treasury` carrying both roles (`src/db/schema.ts:52-59`). Splitting
it is cycle-2 scope, not cycle-10's.

**Synthetic fixtures:** the seed gains fiat-rail backdrop deals, including
one with a leg in flight, so the state is visible without staging it — the
pattern cycle 1 used for `returned` and `priced`. Circle's sandbox needs a
funded balance and a registered test bank account before any call does
anything (`STACK_RULES.md:203-205`); that is this cycle's **first build
step**, recorded so it is not a mid-cycle surprise. No real company, no real
person, no real money — the sandbox key is `SAND_`-prefixed and cannot move
any (`STACK_RULES.md:182-184`).

## 8. Human boundary

**Decided with Chetan, 2026-09-15.** The human gate stays exactly where it
is: **ops authorises the movement when they press the gate**, and the
confirm dialog shows the exact ledger entries before they do — unchanged
from cycles 0 and 1. A webhook reporting on money ops already authorised
**books automatically, unattended**, and so does the reversing entry when
Circle reports a failure. The alternative (parking every completion for a
human to confirm) was rejected: it would make the ledger lag reality by
hours and would misrepresent how settlement works — no bank waits for an
operator before settling.

What it must **never** do:

- **Never initiate a payment no person authorised.** The webhook path books
  and reverses; it never originates a movement.
- **Never trust the webhook body.** A delivery is a notification, not
  evidence: the payment is re-read from Circle's API before anything books,
  exactly as the USDC rail re-derives the transfer from the chain rather
  than trusting what `execute` claimed (`src/lib/rails/types.ts:10-12`).
- **Never book an unverified or unsigned delivery.** A failed signature is
  refused and recorded, never processed "just in case".
- **Never book the same leg twice**, however many times the webhook arrives.
- **Never silently repair an amount mismatch.** If Circle settled an amount
  that is not the expected one, nothing books and it surfaces as an
  exception — cycle 1 set this precedent for wrong-amount repayments, with a
  message naming cycle 3.
- **Never show an in-flight leg as settled.** Not in the ledger, not in the
  balances, not on the deal page.
- **Never touch production, mainnet, or real money.** Sandbox only, labelled
  everywhere it renders.

## 9. Success metric

Measurable in the demo and the evals, not a wish:

- A fiat deal completes **all legs** end to end, each one visibly in flight
  before it settles, with a Circle payment id as evidence per leg.
- **Derived balances never include in-flight money.** Asserted by test: the
  ledger's `balances()` before and after an initiation are identical, and
  change only when the webhook books.
- A **forged signature is refused** and a **duplicate delivery books once** —
  both proved, the second by the database constraint rather than by code.
- Webhooks delivered **out of order** produce the same final ledger as
  in-order delivery. Same assertion, two orderings, identical result.
- A **failed payout** leaves the deal recoverable, the ledger balanced, and
  Circle's own reason on screen.
- **Rail coexistence holds**: cycle 0 and cycle 1 tests stay green untouched,
  and `src/lib/domain/states.ts` still contains zero rail-specific branches —
  the same grep that proved it in cycle 1.

## 10. Demo idea

The demo will show **ops confirming a disbursement on the fiat rail →
Circle returning a pending payout id → the leg rendering in flight (amber,
hollow, dashed) on the deal page, the ops queue and the ledger, with the
derived balance provably unchanged → a signed webhook arriving → the
platform re-reading the payment from Circle and booking the entries
unattended → the leg turning solid and the balance moving**, on screen at
`/ops/deals/[id]` and `/ops/ledger`.

Then the same deal's next leg, forged: a webhook with a bad signature,
refused and logged, nothing booked.

---

## Deliberately not in this cycle

- **Reconciliation of what the webhook cannot resolve** — unmatched
  references, part payments, overpayments, ambiguous matches, exception
  aging. That is cycle 3, and it is the cycle this one makes possible.
- **Post-settlement reversals as a lifecycle** — a failed payout is handled
  here; the general reversal regime (invoice regression, booked reversal
  pairs) is cycle 3's (`PRODUCT_PAPER.md` §7).
- **The priced comparison across three rails** — cycle 4. This cycle
  produces the second real rail the comparison needs, and nothing more.
- **Real bank connectivity.** Circle's sandbox, a test wire account, and the
  standing rule that nothing here may claim production capability
  (`STACK_RULES.md:199-202`).
- **A tick-box AML/screening step on fiat payouts.** Failed screening is one
  of cycle 3's five exceptions; promising it here would be a false
  advertisement, the same reason cycle 1 deferred the verification checklist.

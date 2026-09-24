# Develop — reconciliation ops, slice 1 (the substrate)

Branch `feat/reconciliation-ops`, cut from `feat/circle-fiat` at `94a6398`.
Unmerged. Flag `NEXT_PUBLIC_ENABLE_RECONCILIATION` absent everywhere shared.

## Gate 0 baseline — 2026-09-23, clean tree, on `94a6398`

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             194 tests across 16 files, all passing
npm run build        succeeds — 10 routes, all dynamic
```

## Final gate — 2026-09-24, on `a0922f4`

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             237 tests across 18 files, all passing
npm run build        succeeds — 12 routes, all dynamic
evals                5 pass · 0 partial · 0 fail
data boundary        zero live data-client imports in src/features/reconciliation-ops/
model spend          none — no API key on any path in this slice
```

### Flag off, on a production build — the host is identical

`NEXT_PUBLIC_` variables are inlined at BUILD time, so proving this needed a
build with the flag genuinely absent, not merely unset at start. The first
attempt started a flag-set build with the variable blanked and `/ops/payments`
answered **200** — the test was invalid, not the code, and it is recorded here
because the same mistake would look like a passing proof.

```text
NEXT_PUBLIC_ENABLE_RECONCILIATION= npm run build && npx next start

  ops       /ops                                    200
  ops       /ops/ledger                             200
  ops       /ops/payments                           404
  ops       /ops/payments/99bea655-…                404
  supplier  /supplier                               200
  funder    /funder                                 200
  ops       /                                       200

  occurrences of "Money received" on /ops:            0
```

The consequence, stated rather than discovered later: **this feature cannot be
switched off without a rebuild.** That is the same property
`NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` has and cycle 2 accepted.

---

## 1. Slice scope

**Ops can see every payment the rails have received and attribute each one to
an open settlement leg by hand — in full or in part — with the ledger's
existing sole writer booking the result.**

It lives at **`/ops/payments`** (the queue) and **`/ops/payments/[paymentId]`**
(the attribution screen), reached from a flag-gated card at the top of the
existing ops deal book at `/ops`. Ops is the only seat; every other seat gets
the host's RoleGate card.

This is **slice 1 of two — the substrate**. Slice 2 (epic F, "remember the
sender") is a separate Develop run against the same design file and is not
built here.

**What the design deferred, by name:**

- **Reversals** — moved out of cycle 3 entirely at Discovery, to their own
  cycle with credit loss. They need contra entries inside the sole writer and
  a backwards transition through an untouchable file, and they cannot be
  honestly evaluated in a sandbox where nothing is ever clawed back.
- **The overpayment control** — the design said "a part payment's remainder
  books to `unapplied`". At A5 that turned out to describe something that does
  not happen: a part payment has **no** remainder — the money is fully applied
  and the *leg* is short. A leftover exists only on an **over**payment, which
  needs its own control and a known counterparty (double-entry needs both
  sides, and "whose money is this?" is the question the exception poses).
  So **`unapplied` ships unused in slice 1**, named as a cost rather than
  hidden.
- **Aging from first sight.** The age column measures the rail's `createDate`
  — when the *bank* moved the money — not when this product first saw it.
  `first_seen_at` now exists in the schema to measure it properly; wiring it
  is outstanding.

## 2. User interaction

**The queue.** Ops opens `/ops/payments` and sees one card per rail. The fiat
rail shows a table: payment reference, sender, amount, how much is still
unattributed, how long ago it arrived, and a state pill. Three figures sit
above it — payments received, unattributed count, unattributed value — with
the derivation stamped underneath: *"= SUM(payments) − SUM(movements) ·
derived, never stored"*.

**Rails with no outside still appear**, each carrying its reason rather than an
empty table. A rail that cannot be reached appears too, with a third and
distinct message, and the page states above the figures that they are
**incomplete** — because "we could not ask" and "nothing arrived" are different
statements and only one of them is true.

**The attribution screen.** Clicking a payment shows what the rail says about
it and every open leg it could settle. Candidates are listed **by earliest
maturity — a reading order, explicitly not a recommendation.** Nothing is
ranked, scored or pre-selected. Legs that *cannot* take the money are shown
**with their refusal** rather than hidden.

**The human gate.** Pressing *Attribute* opens a panel showing the **exact
ledger entries** that will book and their **Σ**, labelled *"refused
otherwise"*. Below it: a required-or-optional reason — *the payer confirmed
it · the supplier confirmed it · earliest maturity, unresolved · other* — and
a free note. **The reason is required whenever more than one leg fits**, because
*"ops picked one"* is exactly the audit answer this cycle exists to prevent.
Confirm stays disabled until one is chosen. Nothing books until Confirm.

**What it refuses to do automatically:** pick between candidates, book anything
without a person, apply more than a leg still owes, spend one payment twice,
attribute to a settled leg, or return money to a sender.

## 3. Data used

**Synthetic fixtures** — `src/features/reconciliation-ops/fixtures/`, four
files, ~20 records:

- `payments.ts` — nine inbound payments covering every state a screen must
  survive: unattributed, already spent, two part payments, two orphans of
  different ages, one the rail has not confirmed, one with **no sender at all**,
  one the rail says failed.
- `legs.ts` — five legs: an exact match, two that cannot be told apart, one
  that must accept two movements, one already settled, one genuinely failed.
- `index.ts` — wires each of the five eval cases to its own material, so a case
  cannot drift from the data meant to prove it.

**They are shaped from real data.** The amounts, the collisions and the orphan
are the ones a live reconciliation of the Circle sandbox actually produced on
2026-09-21: 13 deposits, 10 attributed, 3 unattributed, **$50,105.00**.
`UNATTRIBUTED_100` and `SPENT_100` carry full real deposit ids; `ORPHAN_50K`
and `ORPHAN_5` carry real 8-character prefixes with padded suffixes, and say so
in a comment so nobody wastes an hour trying to look them up.

**No live data source is connected in any environment**, and
`src/features/reconciliation-ops/` contains **zero database-client imports** —
audited at every section gate. The fixtures are typed from
`pendingSettlements.$inferSelect` and the rail contract's `InboundPayment`,
import-type only.

**Real shapes, per the design's data contract.** Reads: `pending_settlements`,
`settlement_events`, `ledger_entries`, `accounts`, `invoices`, `parties`, and
the rail's own live inbound list. Writes: `settlement_events` and
`ledger_entries` — **only through `bookMovement`** — plus `pending_settlements`
on resolution and `inbound_payments` for the decision record.

**Schema changes, migration `0007_reconciliation.sql`, applied and read back
from `information_schema`:** a new `account_kind` value `unapplied`; a new
`attribution_reason` enum; a new `inbound_payments` table holding only what
cannot be derived — `first_seen_at`, `owner`, `note`, `resolution_reason`.

## 4. Eval cases

1. **Happy path.** An unattributed payment and a deal stuck waiting for exactly
   that amount. Ops attributes it.
2. **Part payment.** A payment smaller than the leg expects.
3. **Ambiguous** *(edge)*. Two open legs want the same amount; one payment.
4. **No target** *(edge)*. A payment that matches nothing and never will.
5. **The refusals** *(boundary — the limit holding)*. The same payment twice,
   more than is outstanding, and money onto a settled leg — refused **at the
   server**, not only by a disabled button.

## 5. Eval results

Run against `a0922f4`. Pasted from `docs/product/reconciliation-ops/evals.md`.

| # | Case | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | happy path | books, deal advances past `disbursed`, queue falls | deposit `99bea655` attributed to a leg awaiting 100.00; `disbursed → repaid`; unattributed 11 → 10 | **PASS** |
| 2 | part payment | leg stays open owing the remainder; client money moves by exactly the amount | 24.68 booked against a 40.00 leg; leg `initiated`, outstanding 15.32; `client_collections` 18,119.99 → 18,144.67 | **PASS** |
| 3 | ambiguous | both legs offered, neither ranked; nothing books; the matcher parks | 2 candidates offered; matcher answered `pending`; **and** leg B survived after leg A took the deposit — `initiated`, not `failed` | **PASS** |
| 4 | no target | stays visible and unattributed; nothing forced onto it | `5ec3e2b9` (50,000.00) unattributed; two candidate legs offered, neither matching the amount | **PASS** |
| 5 | the refusals | all three refused by name, at the server, nothing booked | `attribution-payment-spent` · `attribution-exceeds-outstanding` · `attribution-leg-settled` | **PASS** |

```text
5 pass · 0 partial · 0 fail
```

**What the harness does not cover, stated rather than implied:** it exercises
the exact sequence `attributePayment` performs, but cannot call the action
itself — that begins with `getIdentity()`, which reads cookies and needs a Next
request context. The action's flag and seat guards are covered by unit tests
and by curl proofs at A4 instead.

## 6. Improvement made

**Before.** The first run scored **2 pass · 0 partial · 3 fail**, and every
failure was the harness's fault rather than the product's. It created fresh
sandbox deposits per case, and **the preview's webhook raced it** — matching
those deposits to the fresh legs and booking them automatically before a case
could attribute anything by hand. Fifteen `webhook_deliveries` rows were linked
to eval legs. Circle also cannot delete deposits, so each run polluted the
baseline permanently.

**Change.** Three things. The harness now consumes deposits **already sitting
unattributed** and builds legs for them afterwards — deterministic, because the
automatic matcher only considers deposits that arrived *after* a leg was
initiated. Its narration became **computed from the values it runs**: the first
version printed "317.11" while testing 100.00 and "240.00" while the arithmetic
underneath was 40.00 − 24.68, which made the report untrustworthy even though
the assertions were correct. And because all five then passed untouched, case 3
was **hardened until genuinely uncertain** — which immediately exposed **FIX
B's second direction**: `completeSettlement`'s `claimed` branch called
`markFailed()` on a leg that recognised a deposit another leg had taken,
killing a leg nothing was wrong with. Cycle 2's own comment there read *"this
is a reconciliation exception (cycle 3)"*. It now parks.

**After.** **5 pass · 0 partial · 0 fail**, with case 3 asserting both
directions of the ambiguity and `pending.test.ts` strengthened from
`status === "failed"` to *the leg is still open, `resolvedAt` is null, nothing
booked*.

## 7. Known limitations

1. **The flag is absent everywhere shared and the branch is unmerged.** With
   the flag off, the routes 404 and the host behaves identically — proved by
   curl across all four seats.
2. **`unapplied` ships unused.** The overpayment control that would use it is a
   named follow-up. This project has been bitten three times by things declared
   before they were used (`fee_income`, `statement-line`,
   `webhook_outcome.ignored`), so the cost is stated rather than assumed free.
3. **`src/lib/reconciliation/` has no unit tests.** The contract named
   `src/lib/reconciliation/*.test.ts` and none were written. The four query and
   action modules are covered by the eval harness against live data and by the
   pure model's 36 tests, but not by the suite. A reviewer should read that as
   a gap, not as coverage.
4. **Aging measures arrival, not first sight.** `first_seen_at` exists in the
   schema and is not yet wired, so the column is labelled *"arrived"* rather
   than *"open"* — claiming the second while measuring the first is the
   described-but-not-performed shape this project keeps catching.
5. **A part-paid deal reads `repaid`.** `advanceFromBookedLegs` derives an
   invoice's status from *which leg types have booked*, not whether they are
   complete — so a leg still owed 15.32 shows the deal as repaid. Pre-existing
   behaviour this slice did not change, surfaced by eval case 2, and recorded
   here rather than quietly absorbed.
6. **One untouchable line moved.** `src/lib/ledger/index.ts` is READ-ONLY USE
   in this contract; `"unapplied"` was added to `CLIENT_MONEY_KINDS` on Chetan's
   explicit approval after a stop-and-ask. Without it `isClientMoney()` would
   have returned false for client money, and the first part payment to book
   would have rendered it as platform funds. `bookMovement` was not touched.

## 8. Evidence walkthrough

You are ops. You open the deal book at `/ops` as you always have, and there is
a new card at the top: **Money received — 5 unattributed, $50,143.25**, with a
line saying deals on demo-internal and USDC settle without an inbound payment
so they never appear there.

You follow it. Three cards. The fiat rail lists every payment Circle holds for
you — not the ones the product expected, *every* one. Two of them the ledger
has never heard of. One is **$50,000**, eight days old, from a sender whose
name means nothing. The other two rails say, in a sentence each, why they have
nothing to show.

You click the **$100** payment from the 18th. The screen tells you what the
rail says about it and lists the open legs it could settle, earliest maturity
first, with a line stating plainly that this is a reading order and not a
recommendation. One leg wants exactly 100.00: a deal sitting at `disbursed`,
waiting for a repayment that arrived six days ago and was never booked.

You press **Attribute 100.00**. A panel opens showing the two ledger entries
that will book — `debtor_cash −100.00`, `client_collections +100.00` — and
their **Σ: 0.00**, labelled *refused otherwise*. Nothing has moved. You pick a
reason, press **Confirm and book**, and the deal advances from `disbursed` to
`repaid`.

Then you go back and press Attribute on the **same payment** again — because
you are checking, or because a colleague did it a second earlier. **The boundary
moment:** it refuses. *"Every penny of this payment has already been
attributed. One payment settles one thing, once."* Not a crash, not a
constraint violation, and not only a greyed-out button — the refusal is
re-derived on the server, which is the layer a race can actually reach.

And the **$50,000** is still sitting there, unattributed, with its age. That is
not an outstanding task. **That is the feature working:** it matches no deal on
this rail, and a product that drove that figure to zero would be a product that
forced a bad match.

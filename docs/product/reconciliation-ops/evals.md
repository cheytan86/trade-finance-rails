# Evals — reconciliation ops, slice 1

Run 2026-09-24 against the real slice on branch `feat/reconciliation-ops`.

```text
5 pass · 0 partial · 0 fail
```

Harness: `scripts/eval-reconciliation.mts` (allow-list item 14).
Command: `npx tsx --env-file=.env.local scripts/eval-reconciliation.mts`

**No model calls. This slice costs nothing to run** — Part 2 returned NO AGENT,
and there is no API key on any path here.

---

## What the harness drives, and what it does not

It exercises the exact sequence `attributePayment` performs:

```text
findPayment → refuseAttribution → bookMovement(matchKeyFor)
            → settle the leg → advanceFromBookedLegs
```

**It cannot call the server action itself.** That action begins with
`getIdentity()`, which reads cookies and needs a Next request context. So the
action's two outer guards — flag absent, wrong seat — are covered by unit tests
and by the curl proofs at A4, not here. Stated rather than papered over: a
harness driving a harness is not evidence.

## It creates no deposits, and the first draft's failure is why

**The first run scored 2 pass · 3 fail, and every failure was the harness's
fault rather than the product's.** It created fresh sandbox deposits for each
case — and the preview's webhook raced it, matching those deposits to the
fresh legs and booking them automatically before a single case could attribute
anything by hand. **15 `webhook_deliveries` rows were linked to eval legs.**
Circle also cannot delete deposits, so every run polluted the baseline
permanently.

Rewritten to work from deposits **already sitting unattributed**, building legs
for them afterwards. That makes it deterministic — the automatic matcher only
considers deposits that arrived *after* a leg was initiated, so a leg created
now can never be grabbed by a deposit from days ago — and it is the honest
case: money that arrived before anybody asked for it is what this cycle is for.

Every invoice, leg, event and entry it creates is deleted at the end, pass or
fail, which returns the orphans it consumed to being orphans.

---

## Case 1 — happy path · PASS

The pair cycle 2's defect 6 separated, reunited.

```text
deal a44e9a39 at 'disbursed', repayment leg open for 100.00
deposit 99bea655 — unattributed since it arrived, never booked
deal advanced: disbursed → repaid
unattributed count 11 → 10
```

**Expected:** the ledger books the repayment, the deal advances past
`disbursed`, the queue's unattributed count falls.
**Actual:** all three. The status move is the one that matters — it is the
defect `advanceFromBookedLegs` exists for, and a booking that leaves the deal
frozen is the failure cycle 2 shipped with.

`99bea655` is the deposit `release.md` named as the product's one known
orphan. This is the first time anything in the product could resolve it.

## Case 2 — part payment · PASS

```text
leg expects 40.00; deposit 570f121f is 24.68
booked 24.68; leg outstanding now 15.32
leg status initiated · deal repaid
client_collections 18,119.99 → 18,144.67
```

**Expected:** the money books, the leg stays open owing the remainder,
`client_collections` moves by exactly the amount attributed.
**Actual:** all three. The leg stayed `initiated` — correct, it is still owed
15.32 — and the movement is exactly 24.68.

**This case could not have passed before FIX A.** `idempotencyKeyFor` was
`${type}:${invoiceId}` on a unique column, so one leg could take exactly one
movement and Postgres refused the second before any code ran.

*Noted, not graded:* the deal reads `repaid` while the leg is still owed
15.32. `advanceFromBookedLegs` derives status from which leg types have
booked, not from whether they are complete. That is pre-existing behaviour
this slice did not change, and a part-paid deal showing `repaid` is arguably
wrong — recorded in develop.md as a finding rather than silently accepted.

## Case 3 — ambiguous · PASS *(hardened)*

```text
two legs, both awaiting 13.57: 79aeea5d and a7a238d1
candidates offered: 2
automatic matcher: pending
leg A attributed by hand; leg B is now 'initiated' (was 'failed' before the fix)
```

**Expected:** both legs offered with neither ranked; nothing books without a
person; the automatic matcher parks rather than failing.
**Actual:** all three, plus the hardening below.

### The hardening, and the defect it found

**All five cases passed on the first clean run, so one was hardened until it
was genuinely uncertain — and it immediately found a real defect.**

FIX B's first half covered **two deposits matching one leg**: the matcher now
returns `pending` instead of throwing. The mirror case —
**one deposit that a second leg also recognises** — went through
`completeSettlement`'s `claimed` branch, which called `markFailed()` and killed
a leg nothing was wrong with. Cycle 2's own comment there read *"this is a
reconciliation exception (cycle 3)"*.

```text
before   leg A settles on the deposit
         leg B recognises the same deposit → markFailed → TERMINAL
         a legitimate leg is dead and the money is still unresolved

after    leg B stays `initiated`, books nothing, and the payment
         surfaces in the queue for a person
```

Proved twice over: the unit test in `pending.test.ts` that asserted
`row.status === "failed"` had to be rewritten, and case 3 now asserts leg B
survives. The refusal itself is unchanged and re-asserted — nothing books,
nothing moves, and it is emphatically not read as "already done".

## Case 4 — no target · PASS

```text
deposit 5ec3e2b9 is 50,000.00 — no leg wants that
state: unattributed · candidates offered: 2
```

**Expected:** it stays visible and unattributed, and nothing is forced onto it.
**Actual:** both. **Staying unattributed IS the pass** — `5ec3e2b9` matches no
face value on the rail, and a product that drove the unattributed figure to
zero would be a product that forced a bad match.

Two candidate legs were offered (from other cases' fixtures) and neither
matched the amount, so neither could take it. The screen shows them with their
refusals rather than hiding them.

## Case 5 — the refusals · PASS

```text
first attribution booked
same payment again          → attribution-payment-spent
150.00 onto a leg owing 100 → attribution-exceeds-outstanding
anything onto a settled leg → attribution-leg-settled
```

**Expected:** all three refused with named reasons, nothing booked, **at the
server** rather than only in a disabled button.
**Actual:** all three, each by rule name rather than by message wording — so
the assertion survives a copy edit.

The first refusal is reached through the database's own unique index and
translated into a sentence ops can act on: *"this payment has already been
attributed — someone else may have just done it."* That is the race a disabled
button cannot stop.

---

## The improvement, before → change → after

```text
BEFORE   run 1: 2 pass · 0 partial · 3 fail
         every failure was the harness racing the preview's webhook, not the
         product. 15 webhook_deliveries rows linked to eval legs.

CHANGE   1. the harness consumes existing orphans instead of creating deposits
         2. its narration is computed from the values it runs, not hardcoded —
            the first version printed "317.11" while testing 100.00 and
            "240.00" while the arithmetic underneath was 40.00 − 24.68
         3. case 3 hardened to the mirror ambiguity, which found FIX B's
            second direction
         4. completeSettlement's `claimed` branch parks instead of failing

AFTER    run 2: 5 pass · 0 partial · 0 fail
```

**Point 2 mattered more than it looks.** The assertions were always running on
the real values — but the report described different ones. An eval whose
narration does not match what it ran is worse than no eval, because it is
believed.

## Standing limitations

- The server action's flag and seat guards are not exercised here (no request
  context). Covered by unit tests and the A4 curl proofs.
- `unapplied` is unused in slice 1 — the overpayment control that would use it
  is a named follow-up, so no case tests it.
- The age column measures arrival, not how long the product has known.
  `first_seen_at` now exists to measure properly; wiring it is outstanding.

# Evals — Rail comparison (cycle 4)

Run 2026-09-24 against the **live database**, at commit `e86248a` plus the
harness. Harness: `scripts/eval-rail-comparison.mts` (allow-list item 9).

```text
FIRST CLEAN RUN   5 pass · 0 partial · 0 fail
HARDENED          case 1, then re-run   5 pass · 0 partial · 0 fail
```

**An all-pass table on a first run reads as untested**, so case 1 was hardened
until the result was genuinely uncertain before this file was written. What
hardened it is below.

---

## What the harness does and does not cover

**It creates nothing and writes nothing.** Cycle 3's harness had to arrange
state a person cannot produce by clicking. This one does not: the state that
makes these cases interesting **already exists** — `usdc`'s genuine emptiness,
the four pre-FIX-1 rows whose durations are impossible, and a recorded
"failure" that is actually a human's repair note. Arranging any of it would
have been inventing the evidence.

**It cannot render React.** So it checks the data every rendered figure comes
from and the rules applied to it, **not the pixels**. The purely presentational
rules — the three badge treatments, the two lines sharing one cell — were
verified on screen by Chetan at A4 and are recorded there. A harness that
claimed to test a component it never rendered would be worse than one that says
what it covers.

---

## Case 1 — happy path, real data · PASS

```text
demo-internal  screen: settled=13  median under a second  slowest under a second
               independent: settled=13  slowest under a second        → agree
usdc           screen: settled=0   no settlements yet
               independent: settled=0  none                           → agree
circle-fiat    screen: settled=28  median 54.9 s  slowest 10.2 min
               independent: settled=28  slowest 10.2 min              → agree

order: demo-internal · usdc · circle-fiat → registry order, not ranked
```

**Expected:** every figure reproducible by someone who does not trust the
screen; fixed order; nothing highlighted.
**Actual:** all three.

### THE HARDENING, and why the first version was weak

The check above compares two aggregations **written by the same person, in the
same language, over the same rows.** That mostly proves the code agrees with
itself. It would not catch a wrong idea about what a median is — only a typo.

So the second pass hands the question to **Postgres**, which has a completely
different implementation:

```sql
percentile_cont(0.5) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (resolved_at - initiated_at)) * 1000
)
```

```text
demo-internal  product 95ms       vs  postgres 95.1ms      → agree
circle-fiat    product 54853ms    vs  postgres 54852.1ms   → agree
```

Sub-millisecond difference is float noise from `EXTRACT(EPOCH)`. **This is the
figure an operator would quote to a supplier**, so having two independent
implementations agree on it is worth more than a second hand-written loop.

---

## Case 2 — the empty rail · PASS

```text
usdc rows in pending_settlements: 0
duration reported as: known:false → renders "no settlements yet"
the rail is still LISTED, not dropped: true
and still declares its verifiability: public
```

**Expected:** words, not a zero; the rail still listed; its declared column
still meaningful.
**Actual:** all three.

**This is a real empty state, not a contrived one.** Cycle 1 settled five legs
on Base Sepolia, but `pending_settlements` was built in cycle 2 — *after* them.
So the product has genuinely never recorded a USDC settlement.

**And it is fragile on purpose.** The harness downgrades itself to PARTIAL the
moment anyone settles a USDC leg, saying so out loud rather than quietly
passing on a case that has stopped testing what it was written to test. The
rule stays covered by the pure fixture test either way.

**Cycle 3 fixed this exact class one layer down** — an empty list must never
read as "nothing arrived" — and this is the same mistake, one cycle later, in a
different column.

---

## Case 3 — FIX 1, one duration and one clock · PASS

```text
settled rows with a duration: 45
NEGATIVE durations still in the data: 4
  demo-internal −256ms · −176ms · −126ms · −63ms
the reader excludes: 4, and the screen states the count
sub-second renders as: "under a second" — never a figure
```

**Expected:** no impossible figure reaches the screen; the exclusion is stated
rather than silent.
**Actual:** both.

**The pass condition is deliberately NOT "no negative rows exist."** Those four
rows are permanent history — they were written before FIX 1 and cannot be
un-written. The condition is that **every one of them is excluded and counted**,
and that nothing written since the fix is negative.

**The exclusion rule needs no cutover date**, which was a design decision worth
the words: a hard-coded "FIX 1 landed at T" would be wrong the moment this
deploys somewhere at a different hour. A negative duration is *impossible*, and
impossibility is self-describing.

---

## Case 4 — the zero trap and the repair note · PASS

```text
demo-internal: 0 of 13 did not settle cleanly
and declares: "Nothing leaves the building, so nothing can fail in transit —
               and nothing can be proved either."

rows recorded as failed, with their reasons:
  circle-fiat: REPAIR 2026-09-18: matched deposit a0afd5d4 which had
               already settled another …

zero is explained in the same cell: true
a recorded "failure" is actually a repair note: true
```

**Expected:** `demo-internal`'s zero cannot be read as "safest"; the column's
name is true of a repair row.
**Actual:** both.

**The trap this case exists for:** `0 of 13` on its own says *"the most reliable
rail."* It is not. It has zero failures because **nothing ever leaves the
building** — there is nothing that could fail. A zero meaning "we never tried"
is indistinguishable from one meaning "it always works", and only the declared
sentence separates them. That is why they share one cell.

**The repair note is the second half.** `failureReason` has drifted into a
repair log. The column is titled **"did not settle cleanly"**, which is *true*
of a human's repair row where "rail failures" would not be. **The fix was the
name** — no filter, no rule, no data migration.

---

## Case 5 — the boundary, it changes nothing · PASS

```text
deal 5916bc47 · rail demo-internal · snapshot locked
bytes compared: 1819
after 5 full renders of the comparison: BYTE-IDENTICAL
static: zero .insert( .update( .delete( revalidatePath or bookMovement
        in history.ts or rail-comparison.tsx
```

**Expected:** the feature is provably incapable of changing what the product
does.
**Actual:** the deal's rail, its pricing snapshot, every settlement event and
every ledger entry are byte-identical after five full renders.

**With no agent and no consequence, the hard limit is not a refusal but an
ABSENCE.** Every other cycle's boundary case tested that something was refused.
This one tests that nothing happened.

### What this case does NOT yet prove, and where it is finished

The design's case 5 has two halves. The half above — *reading changes nothing*
— is proved here. The other half — *stage 2 renders identically with the flag
absent* — is **a build-level proof and runs at Section D**.

It cannot be run here, and the reason is recorded rather than assumed:
`NEXT_PUBLIC_*` variables are **inlined at build time**, so checking the flag at
runtime in a dev process proves nothing about a built artefact. **Cycle 3
shipped exactly that false proof** — blanking the variable on a flag-set build,
getting a 200, and calling it evidence — and recorded it because *"the same
mistake would look like a passing proof."*

---

## The figures move, and that is the point

Between the first read of `pending_settlements` at Discovery and this run, the
numbers changed:

```text
2026-09-24 morning   demo-internal 7 legs · median −63 ms (impossible)
2026-09-24 evening   demo-internal 13 legs · median 95 ms
```

Nothing was seeded. The difference is Chetan walking the smoke path twice —
**and the median going from impossible to sane is FIX 1 landing on rows a
person created by using the product**, not on a fixture.

A figure that moves when the product is used is a measurement. One that does
not is a configuration.

---

## What the evals did to the database

**Nothing.** No invoice, leg, event, entry or deposit was created, modified or
deleted. The harness is five read queries and one repeated read. That is itself
case 5's subject.

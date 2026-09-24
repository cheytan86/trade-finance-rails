# Design — Rail comparison v1 (cycle 4)

Date: 2026-09-24 · From: `docs/product/rail-comparison/discovery.md` · Cycle 4 · FULL track

---

## Step 1.0 — Existing-implementation verdict

**Verdict: ENHANCE, with one FIX named separately.**

Every part of this feature's substrate exists and works. Nothing here is new
machinery; the cycle connects three things that have never been introduced to
each other.

### What exists today, read 2026-09-24

```text
THE INSERTION POINT
  src/app/ops/deals/[id]/page.tsx:276-324 — a Card titled "2 · Pricing",
  holding PricingResults (the breakdown) and PricingForm (the rate card).
  The cycle-1 pattern: each ops stage is a Card titled "N · Stage", showing
  its own content when live and a summary when done.

THE CHOICE
  src/components/pricing-form.tsx:93-107 — a <select> with three options,
  the third flag-gated on NEXT_PUBLIC_ENABLE_CIRCLE_RAIL. The file is
  "use client". Below it, one paragraph of prose (lines 108-111) which is
  the entire decision aid: "usually minutes", "keep those deals small".

THE DATA, WHICH NOTHING READS
  src/db/schema.ts:299-340 — pending_settlements carries `rail`,
  `initiatedAt` (defaultNow), `resolvedAt`, `status`, `failureReason`.
  src/lib/settlement/pending.ts:183 — settleLeg opens a row for EVERY rail,
  because it is rail-neutral. That was cycle 2's FIX 1, and it means the
  duration of every settlement this product has ever made is recorded.
  36 rows exist. No screen, query or report has ever aggregated them.

THE RAIL SEAM
  src/lib/rails/types.ts — the SettlementRail interface: id · label ·
  settlement · prepare · execute · verify · listInbound.
  src/lib/rails/index.ts:12-14 — three rails registered.

THE PRIMITIVES
  Card · Table/Td · Amount · StatusPill · ProvenanceBadge · Button ·
  ConfirmDialog. No new primitive is required by this design.
```

### Why ENHANCE, not NEW

The rail choice is already **explicit** — deliberately made by ops, stored on
`invoices.rail`, read by every later leg. `YOUR_PRODUCT.md` frames the product
as one where the rail is *"an explicit, priced decision rather than a technical
default"*, and the first half of that is already true in code. This cycle makes
the choice **informed**. It adds no state, no status, no table and no route.

### The FIX, named as its own work, never inside the enhancement

**FIX 1 — one duration cannot be measured with two clocks.**

```text
initiatedAt   defaultNow()      the DATABASE's clock (Neon, remote)
resolvedAt    new Date()        the APPLICATION's clock
                                src/lib/settlement/pending.ts:502 and :509
```

Two machines, roughly 60 ms apart. On `circle-fiat`, whose median settlement is
54.9 seconds, the skew is invisible. On `demo-internal`, whose whole settlement
is 78 milliseconds, **the skew is larger than the measurement** — so the median
duration computed from live data on 2026-09-24 came out **negative**.

This is a prerequisite rather than an improvement: **the headline column of this
cycle is a subtraction of exactly these two fields**, and it cannot be built
while one of them lies. It is named here separately so it is never read as part
of the enhancement.

**Not a second FIX, and the distinction matters:** `failureReason` has drifted
into a repair log — the single recorded failure across 36 rows reads *"REPAIR
2026-09-18: matched deposit a0afd5d4 which had already settled"*. That is a
human's note, not a rail failing. **The repair is a label, not a code change**
(see Part 1 step 5), so it is not a FIX.

---

## Part 1 — Product design

### 1. Feature statement

**At the pricing stage of a deal, ops sees all three settlement rails side by
side — how fast each has actually settled for this platform, what can go wrong
on it, and whether anyone outside this company could verify a settlement on it —
with every figure counted from the product's own records, nothing ranked and
nothing recommended.**

**Limits, stated in the sentence's own terms:** it renders; it writes nothing.
Choosing a rail goes through the control that exists today and writes the value
that control writes today.

### 2. Target workflow

**Current (unchanged steps in grey):**

```text
1. ops opens a deal that passed trade validation          unchanged
2. stage 2 · Pricing renders; ops fills the rate card     unchanged
3. ops picks a rail from a dropdown, guided by prose      ← THE DELTA
4. ops confirms; priceInvoice writes invoices.rail        unchanged
5. five legs settle on that rail, fast or slowly          unchanged
```

**Target — step 3 only:**

```text
3a. the product reads its own settlement history, grouped by rail
3b. three rails render side by side: settlements counted, how long they
    took, what can go wrong, whether it is independently verifiable
3c. ops picks from the same dropdown, with the table above it
```

**Steps 1, 2, 4 and 5 are untouched.** The workflow gains no step and loses
none; step 3 gains evidence.

### 3. States & transitions

**No new state. No new transition. No status moves.**

This is the shortest section in this design and that is the point:
`src/lib/domain/states.ts` is untouchable, `invoices.status` is unaffected, and
`pending_settlements.status` is read and never written by this feature.

**What the flag hides:** `NEXT_PUBLIC_ENABLE_RAIL_COMPARISON` absent means the
comparison does not render and stage 2 looks exactly as it does today —
dropdown, prose, nothing else. **Absent is off and is never an error.** Checked
server-side as well as in the browser, the pattern cycle 2 established at
`src/app/api/webhooks/circle/route.ts:40`.

**The one write this cycle makes, and it is not a state change:** FIX 1 changes
which clock stamps `resolvedAt`. No status, no amount and no transition moves;
a timestamp changes its source.

### 4. Data contract

**Read, never written:**

```text
pending_settlements   rail · status · initiatedAt · resolvedAt ·
                      failureReason        (src/db/schema.ts:299-340)
                      THE source for both measured columns.
```

**Written — one field's source, by FIX 1:**

```text
pending_settlements.resolvedAt   src/lib/settlement/pending.ts:502, :509
                                 new Date()  →  the database's clock
```

**NO NEW TABLE AND NO NEW COLUMN.** Surfaced on its own line because a schema
change is a decision to surface rather than smuggle, and this design's answer is
that it needs none: both measured columns are aggregates over rows that already
exist, and both declared columns are properties of the rail, which is code.

**One addition to an interface, which is code and not schema:**

```text
src/lib/rails/types.ts   SettlementRail gains two declared fields:
                           failureModes   what can go wrong on this rail
                           verifiability  who, if anyone, can check a
                                          settlement independently
```

Declared on the interface rather than mapped in the feature folder, **so a rail
cannot join the comparison without saying what can go wrong**. Cycle 3 settled
this argument once already, about `listInbound`:

> *"Making `listInbound` OPTIONAL was considered and rejected: optional is how a
> rail ends up silently answering 'nothing arrived' instead of 'I have no
> outside'… The interface should force every rail to say which it is."*

Cycle 11 adds a Visa adapter. On the interface, it cannot compile without
declaring; in a feature-folder map, it joins with a blank cell and nobody
notices.

**Historical-data note, carried from the FIX:** rows written before FIX 1 keep
their skew. The prototype and the screen must both treat pre-fix rows as
unusable for sub-minute figures rather than silently averaging them in.

**Synthetic fixtures for the prototype** — typed from the generated Drizzle
types; the prototype never reads live rows:

```text
1. a rail with many settlements          the ordinary case
2. a rail with ZERO settlements          usdc today. Must render "no
                                         settlements yet", never "instant"
                                         and never "0 failures"
3. a rail with exactly ONE settlement     where a median is not a median
4. durations spanning ms → minutes        the format must hold across three
                                          orders of magnitude
5. a NEGATIVE duration                    FIX 1's regression. Fails without
                                          the fix and without the display rule
6. a failureReason holding a repair note  the label problem, pinned
```

Fixtures 5 and 6 are regressions, not hypotheticals: the live data produced
both on 2026-09-24.

### 5. Screens & components

**One host screen changes. No new route, no sibling page.**

```text
/ops/deals/[id]   stage 2 · Pricing gains the comparison, rendered ABOVE
                  PricingForm inside the existing Card.
```

**Why inside the stage rather than as its own screen:** the cycle-2 in-flight
strip established the rule — *"it sits INSIDE the stage whose gate is waiting,
not as a banner"*. The same logic holds here: this is evidence for a decision
being made in that stage, not an announcement about the deal.

**The server/client seam, which is load-bearing.** `pricing-form.tsx` is
`"use client"` (line 1). The comparison is a **server component sibling**: the
page queries the history, renders the table, and `PricingForm` continues to own
the `<select>` unchanged. The browser posts decisions, not results — the
standing rule — and this keeps the aggregate query on the server where it
belongs.

**Primitives reused, none invented** (`DESIGN_SYSTEM_NOTES.md`):

```text
Table / Td        the comparison itself — the host's table, 11.5px uppercase
                  tracking-wide headers
mono              every duration and count, per "anything mono: amounts, tx
                  refs, dates, evidence — no exceptions found"
ProvenanceBadge   the verifiability column — see below
text-muted        the declared failure-mode sentences
text-refuse       reserved for refusals, and therefore NOT used here: a
                  failure COUNT is not a refusal
```

**The verifiability column, which the design system reserved for this cycle.**
`DESIGN_SYSTEM_NOTES.md`, written at cycle 2's close:

> *"A THIRD PROVENANCE TREATMENT: solid, but UNLINKED… A Circle payment id is
> real evidence that a reader cannot check themselves: solid because it is real,
> unlinked because there is nothing to open. **That distinction is the axis
> cycle 4 compares rails on**, so it earns its own treatment rather than
> borrowing one."*

The three treatments map one-to-one onto the three rails:

```text
demo-internal   dashed, muted     our word only — nothing left the building
usdc            solid, cobalt     it IS the proof, and you can open it
circle-fiat     solid, unlinked   real evidence you cannot check yourself
```

**This column costs nothing and needs no sample size to be true**, which makes
it the most robust of the three on day one — when `usdc` has zero settlements
and its measured columns are empty.

**The table, as it would render today:**

```text
 rail            settled   how long it took    what can go wrong         verifiable by
 demo-internal        7    under a second      nothing leaves the        us only
                                               building
 usdc                 0    no settlements yet  chain reorg; an           anyone, on-chain
                                               unverified transfer
                                               books nothing
 circle-fiat         28    median 55 s         bank cutoff; the          Circle only
                           slowest 10 min      webhook may never
                                               arrive
```

**"What can go wrong" and "gone wrong here" are deliberately one column, not
two**, and the reason is the trap: `demo-internal`'s *0 of 7* read alone says
"safest rail". It isn't — it has zero failures because **nothing ever leaves the
building**. The declared sentence sits in the same cell as the count so the two
cannot be read apart.

**The label that replaces a code change.** The column counts rows whose status
is `failed`, and one such row is a human's repair note. The column is therefore
titled **"did not settle cleanly"**, not "rail failures" — which is *true* of a
repair row, where "rail failure" would not be. Naming it correctly is the whole
repair; no rule, no filter, no data migration.

### 6. Permissions

**No new grant, no new seat.** `/ops/deals/[id]` already calls `seatGate("ops")`
before any query runs (`src/lib/roles/gate.tsx`; layout-level gating was tried
and rejected in cycle 0's A4 because it hides children visually while the data
still ships in the RSC payload).

**What an ungranted user sees:** the existing role-gate card, before the
comparison's query runs — because `seatGate` returns first. A supplier, funder
or debtor reaching this URL sees exactly what they see today.

**With the flag off:** stage 2 renders as it does now. No empty space, no
disabled control, no trace.

### 7. Error & edge handling

Every row below is a state the live data can produce today, not a hypothetical.

```text
A RAIL WITH NO HISTORY (usdc, right now)
  "no settlements yet" in words. NEVER "instant", never "0 failures",
  never a dash that reads as zero. Cycle 3's B1.3 fixed this exact class:
  an empty list must never read as "nothing arrived".

ONE SETTLEMENT ONLY
  the figure renders with its count beside it — "1 settlement" — and no
  median is claimed from a single observation.

A DURATION UNDER ONE SECOND
  "under a second". Sub-second precision across a network is not
  information, and this is also the display half of FIX 1.

A NEGATIVE DURATION (pre-FIX rows)
  never printed. Rows written before FIX 1 are excluded from sub-minute
  figures and the screen says how many were excluded.

THE QUERY FAILS OR IS SLOW
  the comparison is absent and stage 2 renders as it does with the flag
  off. A pricing decision must never be blocked by a decision aid.
  Cycle 3's D2 learned this the hard way: a rail with no timeout would
  have hung the ops deal book.

A FOURTH RAIL APPEARS
  it cannot, without declaring its failure modes and verifiability —
  the interface will not compile. That is the point of Part 1 step 4.

FAILURE COUNT INCLUDES A REPAIR NOTE
  it does, and the column's title says "did not settle cleanly", which
  is true of it.
```

### 8. Human gates

**This feature has no consequence, so it adds no gate — and it weakens none.**

```text
unchanged   priceInvoice remains the only path that writes invoices.rail
unchanged   the ConfirmDialog on every money movement, showing exact
            entries and their Σ before anything books
unchanged   computePricing — not read by this feature, not called, not
            altered
```

**What it must never do, stated before design ends:**

```text
NEVER rank, sort by, highlight or badge a rail as preferred. The rails
      render in a fixed order. Cycle 3 fixed this principle in code —
      "ambiguity is a choice presented, never a guess made" — and a
      "recommended" chip here is the same mistake in new clothes.

NEVER write anything but FIX 1's timestamp source. No second path sets
      invoices.rail; the dropdown keeps that job.

NEVER show a measured figure without its sample size. "55 s" from 28
      settlements is information; "55 s" alone is an unfalsifiable claim.

NEVER print a figure the data cannot support — a negative duration, a
      median of one, or a sub-second number.
```

---

## Part 2 — The agent question (default no)

**Step needing judgment: none. Conceded, and the concession is not close.**

**1. Which numbered step needs judgment deterministic code cannot deliver?**
Step 3b — assembling the comparison — is the only candidate. It is
`GROUP BY rail`, a subtraction, a median and four sentences a developer wrote.
There is no document to read, no rule to weigh, no context to assess.

**2. What would the agent read that product logic cannot evaluate?** Nothing.
Every input is either an integer this product wrote itself or a sentence
declared on a rail object. Discovery recorded the same finding one layer down:
a Circle deposit carries nine fields and no free text.

**3. Cost per run vs value per case.** At the origin project's measured ~11¢ per
call, every pricing screen view would spend money to produce a figure
`GROUP BY` produces exactly and for free. The arithmetic is not approximate, so
there is nothing to buy.

**4. Failure mode, and whether Part 1's gate contains it.** The failure mode
would be a plausible-but-wrong figure stated confidently on a money screen. Part
1 has **no gate that could contain it**, because this feature has no
consequence to gate — the figures are simply read and believed. That is
precisely why they must be arithmetic.

**Verdict: NO AGENT.** The feature ships as Part 1 alone.

**Where the door stays open, recorded so it is not re-argued from scratch:**
cycle 3's design put it at free-text bank narratives, and that remains the
honest trigger. A comparison of rails is not it — if anything, this feature is
the argument *against* an agent, since its whole value is that every figure can
be reproduced by someone who does not trust the screen.

---

## Part 3 — Agent blueprint

**Not run.** Part 2 returned NO AGENT.

---

## Build order

**ONE SLICE.** Part 3 did not run, and the feature has no internal split worth
making: the FIX, the interface declaration, the query and the table are a single
day's work that is meaningless in halves. A comparison with one column is not a
shippable increment.

**Within the slice, the FIX goes first** — the speed column cannot be built or
evaluated on data that measures itself against two clocks.

---

## Integration contract

**Feature folder:** `src/features/rail-comparison/` — holding `MANIFEST.md` and
the feature's own AGENTS block, per the cycle-2 and cycle-3 pattern.

**Branch:** `feat/rail-comparison`, cut from **`feat/reconciliation-ops`** at
its head. Not from `main`: `main` holds 22 files and **zero** under `src/`, so
branching from it would produce a tree in which every allow-listed file is
missing. The same precedent cycle 2 and cycle 3 both set, and the same
consequence — the branch carries cycles 0–3 with it and cannot be released
alone.

**Flag:** `NEXT_PUBLIC_ENABLE_RAIL_COMPARISON` — **absent means off, never an
error**, checked server-side as well as in the browser.

**New files (additive):**

```text
src/lib/rails/history.ts            the aggregate query: settlements per
                                    rail, median and slowest duration,
                                    did-not-settle-cleanly count
src/lib/rails/history.test.ts
src/components/rail-comparison.tsx  the table — a server component
src/features/rail-comparison/       MANIFEST.md + fixtures
```

**Allow-list — every existing file to be modified, each with its reason:**

| # | File | Reason |
|---|---|---|
| 1 | `src/lib/settlement/pending.ts` | **FIX 1** — `resolvedAt` takes the database's clock at lines 502 and 509. One field's source; no status, amount or transition moves. **A money-path file: re-approved before it is written.** |
| 2 | `src/lib/settlement/pending.test.ts` | FIX 1's regression — a duration is never negative. A refusal may be re-asserted or strengthened, never deleted. |
| 3 | `src/lib/rails/types.ts` | `failureModes` and `verifiability` declared on the `SettlementRail` interface, so no rail can join the comparison silently |
| 4 | `src/lib/rails/demo-internal.ts` | its declarations — "nothing leaves the building"; verifiable by us only |
| 5 | `src/lib/rails/usdc.ts` | its declarations — chain reorg; an unverified transfer books nothing; verifiable by anyone, on-chain |
| 6 | `src/lib/rails/circle.ts` | its declarations — bank cutoff; the webhook may never arrive; verifiable by Circle only |
| 7 | `src/app/ops/deals/[id]/page.tsx` | render the comparison inside stage 2, flag-gated |

**Seven files. Anything else is a stop-and-ask**, including a shared component,
a config or a dependency. "It would be cleaner" is never sufficient.

**Note on `pricing-form.tsx`:** deliberately **NOT** on the allow-list. The
comparison is a server-component sibling; the `<select>` and its prose stay
exactly as they are. If Develop finds the form must change, that is a
stop-and-ask, not a quiet edit.

**Untouchable:**

```text
src/lib/money/            the parser. Not lifted this cycle.
src/lib/ledger/index.ts   the sole writer. This feature books nothing.
src/lib/pricing/          NOT READ AND NOT CALLED by this feature. The
                          txnCost defect found at Discovery is routed to
                          cycle 6 and must not be repaired here.
src/lib/domain/states.ts  byte-identical. No state moves.
existing components       off-list, untouched.
migrations 0000–0007      never edited. This cycle writes none.
```

**Permitted imports for new files:** `@/components/ui/*` · `@/lib/cn` · the
drizzle schema (type-only where possible) · `lucide-react`.

**The smoke path** (for Develop to agree at Gate 0.5):

```text
1. create invoice → approve → price → fund → supplier paid   (the spine)
2. open /pay/[invoiceId] as a debtor
3. switch role; each seat sees only its own surface
```

Walked at every section gate and after any prompt touching allow-list item 1 —
which is a money-path file.

---

## Eval plan

| # | Case | Passes when | Fails when |
|---|---|---|---|
| **1** | **Happy path, real data.** A deal at stage 2 with the flag on. | Three rails render with settlement counts, durations and failure counts that **match a direct query run independently**, and the rails appear in a fixed order with nothing highlighted. | A figure disagrees with the database, or one rail is visually preferred. |
| **2** | **The empty rail, real data.** `usdc` has zero rows in `pending_settlements` today. | It reads **"no settlements yet"** in words, its verifiability column still reads "anyone, on-chain", and no zero or dash appears where a duration would. | It shows "0", "—", "instant", or "0 failures" — any of which reads as a measurement. |
| **3** | **FIX 1, and its regression.** Settle a leg on `demo-internal` and compute its duration. | The duration is **not negative**; both timestamps come from one clock; and the screen shows "under a second" rather than a figure. A test pins that a negative duration cannot be produced. | A negative duration is recorded, or the display rule hides a defect the write path still has. |
| **4** | **The zero trap, and the repair note.** `demo-internal` shows 0 of 7; `circle-fiat`'s single failure is a human's repair note. | `demo-internal`'s zero sits in the same cell as "nothing leaves the building", so it cannot be read as "safest"; and the column is titled **"did not settle cleanly"**, which is true of a repair row. | The zero stands alone, or the column claims "rail failures" and counts a human's note as one. |
| **5** | **THE BOUNDARY — it changes nothing.** Price a deal with the flag on, then with it off. | `invoices.rail`, the pricing snapshot and every ledger entry are **byte-identical** between the two runs; the comparison writes nothing; and with the flag off stage 2 renders exactly as it does today. | Any figure differs, any row is written, or the flag-off screen shows a trace. |

**Case 5 is the boundary case.** With no agent and no consequence, the hard
limit is not a refusal but an **absence**: this feature must be provably
incapable of changing what the product does.

---

## Build-readiness gate

| Question | Answer |
|---|---|
| Job in one sentence | **yes** — Part 1 §1 |
| Every fact traced to a named file or table | **yes** — every claim cites a path read on 2026-09-24, and every figure a query run the same day |
| Missing-data behaviour known | **yes** — §7: no history, one settlement, sub-second, negative, query failure, fourth rail, repair note |
| Human gate before every consequence | **n/a, and stated** — the feature has no consequence. No existing gate is weakened, and §8 names each one it leaves alone |
| One eval case tests the limit | **yes** — case 5, which tests that nothing changed |

---

## Open decisions, and what they are waiting on

**1. The cost column, removed from v1 and routed.** Circle publishes no fee
schedule and the sandbox charges nothing. Cost lands in cycle 6's signed grid,
together with the `txnCost` defect Discovery found — the transaction cost
deducted from the supplier and flowing into `platformMargin` while no account
records the platform paying a rail. **`src/lib/pricing/` is untouchable in this
cycle** precisely so that defect is not half-repaired here.

**2. Whether pre-FIX rows should be shown at all.** This design excludes them
from sub-minute figures and states the exclusion on screen. An alternative —
discarding them entirely — was not chosen, because 29 of 36 rows are
`circle-fiat` legs whose 55-second median is unaffected by a 60 ms skew, and
throwing away usable history to avoid explaining a footnote is the wrong trade.
**Revisit if Develop finds the footnote cannot be written clearly.**

**3. The verifiability column's wording.** "us only / anyone, on-chain / Circle
only" is this design's phrasing, not a tested one. It is the column most likely
to be misread as a ranking — "anyone" sounds better than "us only" — and
Develop's Section B should pressure the wording specifically. The column is
still worth having: it is the only one that is true on day one, when `usdc` has
no measurements at all.

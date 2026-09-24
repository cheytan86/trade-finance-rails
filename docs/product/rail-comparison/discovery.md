# Discovery — Rail comparison v1 (cycle 4)

Date: 2026-09-24 · Track: **FULL** (weight test at the end of this file)

**Verdict at Step 2: go, reshaped from "Priced rail comparison v1".** The
original idea carried a cost column. Chetan removed it at the grill on
2026-09-24, because one of the three cost cells has no honest number and the
project does not invent numbers. What remains — **speed and risk, both measured
from the product's own records** — turned out to be a stronger feature than the
one that was asked for, and the rename is recorded in `CYCLES.md` rather than
left to contradict this file.

---

## 1. User

**An ops operator standing at stage 2 of a specific deal** — the pricing stage
of `/ops/deals/[id]`, rate card filled in, about to commit terms — choosing
which settlement rail this deal's five money legs will run on.

Not "the ops team". One person, on one screen, at the single moment in the
product where the rail is chosen. `src/lib/roles/gate.tsx` already gates that
screen on the `ops` seat; this feature adds no seat and no grant.

## 2. Workflow

1. Ops opens a deal that has passed trade validation and reaches stage 2.
2. They fill the rate card — advance rate, supplier rate, funder rate,
   transaction cost.
3. **They choose a settlement rail.** Today this is a bare dropdown.
4. They confirm. `priceInvoice` writes `invoices.rail`, and the choice is
   frozen: every later leg — fund, disburse, payout, residual — runs on that
   rail.
5. The deal settles, fast or slowly, cleanly or with an exception someone has
   to work.

The feature sits inside step 3, and its evidence comes from step 5 of every
deal that came before.

## 3. Trigger

**A deal reaching the pricing stage.** Decided 2026-09-24: every deal, every
time — not a threshold, not an opt-in screen.

The reason is the claim itself. `discovery-kit/YOUR_PRODUCT.md` frames this
product as one *"in which the settlement rail for each money leg is an
explicit, priced decision rather than a technical default."* A comparison shown
only sometimes makes that true only sometimes.

## 4. Current process (in the app today)

**The choice exists and is genuinely explicit. It is simply not informed.**

`src/components/pricing-form.tsx:93-107` renders a `<select>`:

```text
Settlement rail   demo-internal (books instantly)
                  USDC on Base Sepolia (real testnet transfers)
                  Fiat · Circle sandbox (settles later)   ← flag-gated
```

Underneath it, one paragraph of prose (`pricing-form.tsx:108-111`):

> *"On the fiat rail a leg is INITIATED now and confirmed by Circle later —
> usually minutes… On the USDC rail every leg moves real testnet USDC between
> labelled demo wallets and books only once verified on-chain. Faucet-scale:
> keep those deals small (≈2–20 USDC)."*

That prose is the entire decision aid. **There are no numbers on the screen at
all.**

**Three facts about what the product knows and does not connect:**

```text
pricing cannot see rails     grep -rn "rail" src/lib/pricing/   →  0 hits
                             The rate card's txnCostType / txnCostValue
                             (src/lib/pricing/index.ts:20-22) sit three fields
                             from the rail selector and have no relationship
                             to it. The cost of the rail is a number a human
                             types from memory.

the data DOES exist          pending_settlements carries `rail`, `initiatedAt`
                             (defaultNow) and `resolvedAt` per leg
                             (src/db/schema.ts:307-330). settleLeg opens a row
                             for EVERY rail — it is rail-neutral, which was
                             cycle 2's FIX 1 — so the duration of every
                             settlement this product has ever made is already
                             recorded.

nothing reads it             No screen, query or report aggregates those rows
                             by rail. The product has been keeping this record
                             since cycle 2 and has never once looked at it.
```

**Off-platform, the decision is made from memory.** There is no spreadsheet and
no runbook entry: the operator picks the rail they picked last time, or the one
the prose sounds least alarming about.

## 5. Pain / gap

**The product's headline claim is half true, and the missing half is the half
in the headline.** The rail is *explicit* — deliberately chosen, stored on the
invoice, visible on every later screen. It is not *informed*: nothing on the
screen says what choosing one rail over another does to this deal.

**What that costs, measured on 2026-09-24 against the live database:**

```text
pending_settlements: 36 rows

rail            total  settled  failed  open   median     slowest
circle-fiat        29       28       1     0    54.9 s     10.2 min
demo-internal       7        7       0     0   −63 ms(!)     78 ms
usdc                0        —       —     —        —          —
```

Every one of those figures is invisible in the product today. Three of them are
findings in their own right:

**a) The prose on the screen is wrong in the direction that matters.** It says
the fiat rail confirms *"usually minutes"*. The measured median is **54.9
seconds** — better than advertised — but the slowest observed was **10.2
minutes**, which is the number an operator actually needs when someone is
waiting.

**b) `usdc` has no history at all.** Cycle 1 settled five legs on Base Sepolia,
but `pending_settlements` was built in cycle 2, *after* those deals ran. So on
day one the comparison must say **"no settlements yet"** for a rail that
demonstrably works. That is not a defect to design around — it is the empty
state this feature has to get right, and it exists for real rather than
hypothetically.

**c) THE PRODUCT CANNOT TIME ITS OWN FAST RAILS.** `demo-internal`'s median
duration is **negative**, because the two timestamps come from two different
clocks:

```text
initiatedAt   defaultNow()   the DATABASE's clock (Neon, remote)
resolvedAt    new Date()     the APPLICATION's clock
                             src/lib/settlement/pending.ts:502, 509
```

On a rail that takes 55 seconds the skew is noise. On a rail that takes 78
milliseconds **the skew is larger than the measurement**, so the recorded
duration is sometimes below zero. Any speed column built on these two columns
as they stand would print a negative number on the product's own default rail.

**d) `failureReason` has been used as a repair log.** The single recorded
failure across 36 rows reads:

```text
circle-fiat · "REPAIR 2026-09-18: matched deposit a0afd5d4 which had
               already settled"
```

That is a human's note about fixing something, not a rail failing. A "failures"
column built on `failureReason` would report it as a rail defect. The field is
free text and has drifted.

## 6. Opportunity

**What the feature does:** at the pricing stage, show all three rails side by
side with two columns — **how fast each has actually settled for us**, counted
from `pending_settlements`, and **what can go wrong on it**, declared by the
rail itself and paired with how often it has gone wrong here. Ops picks with
the figures in front of them. The choice writes exactly the value the dropdown
writes today.

**The two columns are deliberately both evidence.** Speed is counted, not
claimed. Risk is declared *and* counted, because either alone misleads:

- **Counted alone has a trap.** `demo-internal` shows zero failures in seven
  settlements. It has zero failures because **no money leaves the building** —
  there is nothing to fail. A zero meaning *"we never tried"* is
  indistinguishable from a zero meaning *"it always works"*, and only the
  declared line can tell them apart.
- **Declared alone is what already exists.** The dropdown has prose under it.
  Writing better prose is not a cycle.

**Initial read: PRODUCT, not agent.** The work is aggregating rows the database
already holds and rendering text each rail declares about itself. There is
nothing to weigh. Cycle 3's design recorded where the agent door reopens — free
text arriving from outside, such as bank-statement narratives — and this is not
that; every input here is either an integer the product wrote or a sentence a
developer wrote. An agent would be re-deriving `GROUP BY rail` probabilistically.

**Classification hypothesis for Design to test: ENHANCE, plus one FIX.** The
pricing screen, the rail seam and the in-flight record all exist; this connects
them. The FIX is finding (c) — two clocks cannot measure one duration — and it
is a prerequisite rather than an improvement, because the headline column of
this feature is unbuildable while it stands.

## 7. Data plan

**Real tables, all of which exist:**

```text
pending_settlements   src/db/schema.ts:299-340. rail · status · initiatedAt ·
                      resolvedAt · failureReason. THE source for both columns.
settlement_events     the booked record, for cross-checking that a settled
                      pending row corresponds to a real movement.
invoices.rail         where the choice lands (settlement_rail enum).
webhook_deliveries    cycle 2's delivery log — a possible second source for
                      circle-fiat's failure counts, and one to treat carefully:
                      cycle 3 proved it can be silently incomplete.
```

**No new table is expected.** Both columns are aggregates over rows that exist.
Design confirms or overturns this; if a schema change appears, it is surfaced
twice per the standing rule, never smuggled.

**Synthetic fixtures the prototype needs**, typed from the generated Drizzle
types — the prototype never reads live rows:

```text
1. a rail with many settlements        the ordinary case
2. a rail with ZERO settlements        usdc today — the empty state, which
                                       must read "no settlements yet" and
                                       never "instant" or "0 failures"
3. a rail with ONE settlement          where a median is not yet a median
4. durations spanning ms → minutes     so the format holds across three
                                       orders of magnitude
5. a negative duration                 finding (c) — the fixture that pins
                                       the clock fix and fails without it
6. a failureReason holding a repair    finding (d) — a human's note must not
   note                                be counted as a rail failure
```

Fixtures 5 and 6 exist because the live data produced both. They are
regressions, not hypotheticals.

## 8. Human boundary

**What it must never do without a person on screen:** nothing changes without
ops pressing the existing confirm. This feature writes nothing on its own — it
renders, and the operator's existing action does the writing.

**What it must never do at all:**

```text
NEVER recommend a rail, rank them, highlight one, or order them by anything
      but a fixed order. The figures are presented; the choice is ops's.
      Cycle 3 fixed this exact principle in code — "ambiguity is a choice
      presented, never a guess made" — and a "recommended" badge here is the
      same mistake wearing a different hat.

NEVER change what books. It does not touch computePricing, does not alter the
      pricing snapshot, and does not add a second path that sets invoices.rail.
      The comparison writes precisely the value the dropdown writes today.

NEVER show a measured figure without its sample size. "~4 min" from 11
      settlements is information. "~4 min" alone is a claim, and an unfalsifiable
      one.

NEVER print a number the data cannot support — a negative duration, a median
      of one observation, or a failure count that includes a human's repair
      note.
```

## 9. Success metric

**The metric: every figure on the comparison is reproducible from the database
by someone who does not trust the screen.**

Concretely, for each rail shown: the settlement count, the median duration and
the failure count each match a direct query run independently. Where a figure
cannot be supported — `usdc` today, with zero rows — the screen says so in
words rather than showing a zero.

**Explicitly NOT the metric:** that ops changes which rail they choose. A
comparison that shifts behaviour might be informing a decision or might be
nudging one, and this feature is forbidden from nudging. Whether the mix of
rails moves is Chetan's to interpret; that the figures are true is the
product's job.

**A second, harder metric, for cycle close:** the negative duration is gone and
cannot come back — pinned by a test, not by having been fixed once.

## 10. Demo idea

The demo will show **a deal at the pricing stage** → **the product reading its
own settlement history, grouped by rail** → **three rails side by side with
measured speed, declared failure modes and observed failure counts, none of
them ranked** → **ops choosing, with the figures in front of them** → **the
same confirm that exists today writing the same value**, on screen at
`/ops/deals/[id]`.

**The moment worth watching:** `usdc` says *"no settlements yet"* while the
other two carry real medians — a product declining to describe something it has
not measured, next to two columns where it has. That is the thesis of this whole
project in one row of a table.

---

## The weight test (applied 2026-09-24, at the end of the grill)

```text
Does it call a model?                              NO
Does it move money?                                NO   — read-only; changes
                                                          no booking and no
                                                          pricing arithmetic
Does it change schema?                             NO   — both columns are
                                                          aggregates over rows
                                                          that already exist
Does it touch auth or permissions?                 NO   — /ops/deals/[id]
                                                          already gates on the
                                                          ops seat
Does it modify more than a handful of existing     YES  — six
files?
```

**FULL track**, by one file — and the sixth file is the one that matters.

### Why six, and why the sixth was not negotiated away

Each rail must **declare its own failure modes**, which means the declaration
lives on the rail interface: `src/lib/rails/types.ts`, plus `demo-internal.ts`,
`usdc.ts` and `circle.ts`, plus the pricing form and the deal page.

The cheaper shape — a rail-to-failure-modes map inside the feature folder —
touches two or three files and would have made this LIGHT. It was rejected on
2026-09-24, on precedent. Cycle 3's manifest settled the same argument:

> *"Making `listInbound` OPTIONAL was considered and rejected: optional is how
> a rail ends up silently answering 'nothing arrived' instead of 'I have no
> outside'… The interface should force every rail to say which it is."*

Cycle 11 adds a Visa adapter. With a feature-folder map, that rail joins the
comparison with an empty risk cell and nothing stops it. With the declaration
on the interface, it cannot compile without saying what can go wrong.

`CYCLES.md` predicted cycle 4 would be *"likely LIGHT"*. On the honest reading
it is FULL, and the prediction is corrected there rather than the test being
softened to match it.

---

## What this cycle gave up, recorded rather than dropped

**1. The cost column, and with it the word "priced".** Circle publishes no fee
schedule — `design.md` (cycle 3) recorded the fee page as *"behind a support
page that does not render"* — and the sandbox charges nothing, so one of three
cost cells has no honest number. Chetan removed cost from v1 on 2026-09-24
rather than seed it with an assumption.

**The consequence, stated plainly: cycle 4 does not make the product's headline
claim true.** *"An explicit, priced decision"* stays half-proven until rail
costs land in cycle 6's signed grid, where `CYCLES.md` already routed them. The
cycle is renamed to match what it does.

**2. A real finding in the cost model, which now needs cycle 6.** Found at this
Discovery and repeated here so it is not lost:

```text
supplierDisbursement = principal − supplierInterest − txnCost
platformMargin       = funderFinancing − supplierDisbursement
                       src/lib/pricing/index.ts:50-62
```

The transaction cost is deducted from **the supplier**, and because margin is
the gap between what the funder pays and what the supplier receives, **it flows
straight into `platformMargin`**. Meanwhile `account_kind` has no expense
account — the platform paying Circle a wire fee is not a movement this ledger
can record. So the product charges a cost, books it as margin, and never
records paying it.

Two things that contradicts:

- **The code's own comment**, two lines below: *"fees are visible lines, never
  margin (paper §7/§9)."* Today `txnCost` is both.
- **The policy Chetan set on 2026-09-22** (`CYCLES.md`, rail costs): the
  platform bears its own account, funder accounts and supplier accounts; the
  supplier bears only per-debtor VANs, **recovered in the rate and never as a
  line item**. The code charges every transaction cost to the supplier as a
  line item.

Routed to **cycle 6**, which owns the programme and the signed grid.

**3. The supplier-facing view.** Chetan's instinct at the grill was that the
supplier should know rail costs before setting up a programme. Two things stood
against building it now: **the programme does not exist** (cycle 6 builds it),
and under the 2026-09-22 policy the supplier is insulated from rail costs — so
a supplier-facing comparison would today show three identical numbers. Recorded
against cycle 6, where both objections dissolve.

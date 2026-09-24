# Develop — Rail comparison (cycle 4)

One slice, built 2026-09-24 on `feat/rail-comparison`, cut from
`feat/reconciliation-ops` at `40d6033`. Branch stays unmerged.

---

## 1 · Gate 0 baseline (2026-09-24, clean tree, on `40d6033`)

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             237 tests across 18 files, all passing
npm run build        succeeds — 12 routes, all dynamic
```

## 2 · The final gate

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             259 tests across 19 files, all passing   (from 237/18)
npm run build        succeeds — 12 routes
evals                5 pass · 0 partial · 0 fail  (case 1 hardened first)
```

No route was added. The feature lives inside a stage of a screen that
already existed, which is what an ENHANCE should look like from the outside.

## 3 · Slice scope

**The only slice.** Part 3 did not run — Part 2 returned NO AGENT — and the
feature has no internal split worth making: the FIX, the interface declaration,
the query and the table are meaningless in halves. A comparison with one column
is not a shippable increment.

Within the slice, **FIX 1 went first**, because the headline column is a
subtraction of the two fields it repairs.

## 4 · The manifest, reconciled against the diff

`git diff --name-only 40d6033` gives **18 files**. Against `main` it gives 165,
because `main` holds no application code and the diff would carry cycles 0–3
with it — so the branch parent is the honest comparison for this slice, and
both numbers are recorded rather than the convenient one.

```text
allow-list, modified       pending.ts · pending.test.ts · types.ts ·
                           demo-internal.ts · usdc.ts · circle.ts ·
                           ops/deals/[id]/page.tsx · eval-circle-fiat.mts ·
                           eval-rail-comparison.mts              (9 of 9 — ALL used)
new, named in the contract rails/history.ts · history.test.ts ·
                           components/rail-comparison.tsx ·
                           features/rail-comparison/{MANIFEST.md,fixtures.ts}  (5)
Gate 0.5 rails             .env.example · AGENTS.md                            (2)
docs                       rail-comparison/evals.md                            (1)
```

**That is 17. The eighteenth needs explaining rather than absorbing:**

```text
docs/product/CYCLES.md     NOT named in this cycle's contract.
```

It carries the two findings Chetan's smoke path produced — the supplier who
cannot see their residual, the funder who cannot see what they earned — routed
to cycles 6 and 5. Documentation, not code; no behaviour depends on it. Cycle 3
recorded `drizzle/meta/_journal.json` the same way.

**Untouchables, byte-identical to their Gate 0.5 hashes:**

```text
src/lib/money/index.ts      f8d378d3…   ✓
src/lib/ledger/index.ts     0ba1953f…   ✓
src/lib/domain/states.ts    25b7d681…   ✓
src/lib/pricing/index.ts    2e69ac6a…   ✓   ← the txnCost defect stayed
                                              ROUTED to cycle 6, unrepaired
```

## 5 · Eval results

Full record: `docs/product/rail-comparison/evals.md`.

```text
1  happy path, real data                  PASS   hardened, then re-run
2  the empty rail                         PASS
3  FIX 1 — one duration, one clock        PASS
4  the zero trap and the repair note      PASS
5  the boundary — it changes nothing      PASS

5 pass · 0 partial · 0 fail
```

**The first clean run was already 5/5**, which the method treats as a reason to
harden rather than to celebrate. Case 1 was the weak one: it compared two
aggregations written by the same person, in the same language, over the same
rows — enough to catch a typo, not enough to catch a wrong idea about what a
median is. The hardened version hands the question to Postgres:

```text
percentile_cont(0.5) WITHIN GROUP (ORDER BY …)

demo-internal   product 95ms      vs  postgres 95.1ms      agree
circle-fiat     product 54853ms   vs  postgres 54852.1ms   agree
```

## 6 · The flag-off proof, on two real production builds

**Two builds, not one.** Cycle 3 shipped a false proof here — it blanked the
variable on a flag-*set* build, got a 200, and called it evidence. Its own
record says *"the same mistake would look like a passing proof."*
`NEXT_PUBLIC_*` is inlined at build time, so only a genuine rebuild proves
anything.

Deal `90f7279e` at `approved` — the exact state where the comparison renders.

```text
BUILD 1 · the flag line REMOVED from .env.local, rebuilt
  GET /ops/deals/90f7279e…  (ops cookie)          200 · 33,603 bytes
    "What each rail has actually done"                0 occurrences
    "no settlements yet"                              0
    "Settlement rail"  (the rate card)                1   ← still there
    "2 · Pricing"                                     2   ← stage intact

BUILD 2 · the flag restored, rebuilt
  GET same URL                                     200 · 46,366 bytes
    "What each rail has actually done"                4
    "no settlements yet"                              2
    "did not settle cleanly"                          3
    "Nothing here is ranked"                          2
    "Settlement rail"                                 1   ← unchanged
```

**With the flag absent, stage 2 is byte-for-byte the screen it was before this
cycle** — the rate card and the dropdown, nothing else. That is case 5's second
half, and it is now closed.

## 7 · What Develop found

### FIX 1 is working on rows a person created, not on a fixture

```text
2026-09-24 morning   demo-internal   7 legs · median −63 ms  (impossible)
2026-09-24 evening   demo-internal  13 legs · median  95 ms
```

Nothing was seeded. The difference is Chetan walking the smoke path twice.
A figure that moves when the product is used is a measurement; one that does
not is a configuration.

### The interface caught a stub rail, which is the feature working

Adding `failureModes` and `verifiability` as **required** fields turned `tsc`
red on `scripts/eval-circle-fiat.mts` — a stub rail in cycle 2's harness.
Approved as allow-list item 8.

**And it is the second time that exact file has been added for that exact
reason.** Cycle 3 added it as its item 13 when `listInbound()` joined the
interface. Making the fields optional would have kept `tsc` green and let
cycle 11's Visa adapter join the comparison with a blank risk cell — which is
precisely what cycle 3 rejected: *"optional is how a rail ends up silently
answering 'nothing arrived' instead of 'I have no outside'."*

**The standing lesson, recorded so it is not met a third time: an interface
change's allow-list must name every implementor, including the fake ones.** A
design that predicts the principle and not the consequence is half a contract.

### Three eval harnesses, three stop-and-asks

```text
cycle 3   scripts/eval-reconciliation.mts     mid-build, item 14
cycle 4   scripts/eval-circle-fiat.mts        mid-build, item 8
cycle 4   scripts/eval-rail-comparison.mts    mid-build, item 9
```

Every design writes an eval plan; no design has ever named the file the evals
run in. That is a gap in the contract template rather than in any one cycle.

### A comment that flattered the code, corrected

The first draft of the error path implied the try/catch protects the deal page
from a database outage. It does not: `invoiceDetail`, `movementsForInvoice`,
`accountRefsFor` and `legsForInvoice` all run *before* the comparison renders,
so an outage takes the page long before it reaches this code. The catch covers
a failure specific to **this query** — a timeout as `pending_settlements` grows,
a migration mid-flight — and the comment now says exactly that.

### One vocabulary drift

`ml-1.5` was used exactly once in this repository, and that once was mine; the
host uses `ml-2`. Fixed. Cycle 3 shipped `text-track-idle`, a colour this app
does not define, which rendered as nothing.

### And a mistake of process, recorded rather than smoothed over

The eval harness was run **before** reading `tsc`'s output. It crashed on
`ledgerEntries.settlementEventId`, a column that does not exist — and `tsc` had
already said so, in output that was scrolled past. Cycle 3's lesson, verbatim:
**a gate you run and do not read is not a gate.**

---

## 8 · THE FINDING THIS SECTION PRODUCED — and it is three cycles old

Probing the flag-off build with a forged cookie turned up something that has
nothing to do with cycle 4.

```text
NO COOKIE AT ALL, against the production build:

  /ops              200 ·  58,247 bytes   no gate card
  /ops/ledger       200 · 144,664 bytes   no gate card
  /ops/payments     200 · 105,772 bytes   no gate card
  /funder           200 ·  31,019 bytes   no gate card
  /supplier         200 ·  53,988 bytes   no gate card

WRONG SEAT (a supplier cookie on an ops page):

  /ops               12,130 bytes   ← the gate card, no data
  /funder            12,144 bytes   ← the gate card, no data
```

The cause is one operator, `src/lib/roles/gate.tsx:22`:

```ts
if (identity && identity.seat !== required) return <RoleGate … />;
return null;
```

**A *wrong* seat is refused. A *missing* one falls through.**

### I nearly reported this as new. Cycle 1 found it first.

`docs/product/settlement-usdc/deploy.md:157-176` records it exactly, with the
same line of code quoted and the correct analysis:

> *"This is not a security hole in this product — seats are self-declared with
> no sign-in by design (PRD.md §1), so an anonymous visitor can obtain any seat
> by setting the cookie themselves… But it is currently an accident of
> `identity &&` rather than a stated posture."*

And it ends with a decision that was owed:

> **"Chetan's decision, carried to the next session: document it as intended,
> or treat no-cookie as no-seat and show the gate."**

**Cycle 2 came and went. Cycle 3 came and went. `gate.tsx:22` is unchanged and
no record anywhere states the posture.** The decision was carried to the next
session and the next session never took it.

### What it is, and what it is not

**Not an emergency.** Seats are self-declared with no sign-in; anyone can mint
any cookie. Previews have been behind Vercel Authentication since cycle 3, and
production is dark. Every row in the database is sandbox or testnet demo data.

**But every deploy record in this project says "an unauthorized path is
refused", and every one of them tested only the wrong-seat half.** The claim is
true and incomplete, and the incompleteness has been known since cycle 1.

**Not cycle 4's to fix.** `gate.tsx` is the identity path, off this cycle's
allow-list, and cycle 4a is the auth cycle by name. Recorded here, routed in
`CYCLES.md` with an owner rather than to "the next session".

### The pattern this is the second instance of, today

Earlier today, cycle 2's R0 re-run found **two of its four named findings had
never been reached by cycle 3** — not built, not deferred with a reason, simply
not reached. This is the same shape: a finding recorded honestly, with a
decision named, and no owner. **"Carried to the next session" is where findings
go to disappear.** Both are now routed to a numbered cycle instead.

---

## 9 · Limitations of this slice, stated

1. **The numbers are thin.** 13 settlements and 28 settlements, in a demo,
   mostly created by one person testing. Enough to set an expectation; not
   enough to draw conclusions about rail reliability.
2. **One rail does nothing and one has never been used.** `demo-internal` moves
   no money and `usdc` has no history, so the *choice* is largely predetermined
   today. The comparison becomes genuinely decision-changing when cycle 11 adds
   the Visa adapter and there are three real options with real track records.
   Chetan raised exactly this at Section B; the decision was to leave the table
   as it is.
3. **The harness cannot render React**, so the purely presentational rules —
   the three badge treatments, the two lines sharing one cell — are verified by
   a person on screen and recorded at A4, not by a test.
4. **Cost is absent**, and with it the word *priced*. The product's headline
   claim stays half-proven until cycle 6's signed grid.

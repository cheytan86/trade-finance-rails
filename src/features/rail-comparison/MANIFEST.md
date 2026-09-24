# Manifest — rail-comparison (cycle 4) · branch `feat/rail-comparison`

## The contract (from docs/product/rail-comparison/design.md — verified at Gate 0.5, 2026-09-24)

**ENHANCE, with FIX 1 named separately.** Additive by default; **only the
allow-list below may be modified**; an unnamed modification is a stop-and-ask.
Branch cut from `feat/reconciliation-ops` at `40d6033` — `main` holds 22 files
and **zero** under `src/`, so branching from it would produce a tree where every
allow-listed file is missing. The same precedent cycles 2 and 3 both set.

Flag `NEXT_PUBLIC_ENABLE_RAIL_COMPARISON` — **absent means off, never an
error**, checked on the server as well as in the browser.

**ONE SLICE.** Part 3 did not run, and a comparison with one column is not a
shippable increment. **Within the slice, FIX 1 goes first** — the speed column
cannot be built or evaluated on data that measures itself against two clocks.

### Why the cycle exists, in one number

`pending_settlements` has carried `rail`, `initiatedAt` and `resolvedAt` for
every leg since cycle 2 — `settleLeg` is rail-neutral, which was that cycle's
FIX 1. **36 rows. Never once read.** Measured on 2026-09-24, the first time
anything looked:

```text
rail            total  settled  failed  median      slowest
circle-fiat        29       28       1    54.9 s     10.2 min
demo-internal       7        7       0   −63 ms(!)     78 ms
usdc                0        —       —         —           —
```

Three findings in one query: the on-screen prose says *"usually minutes"* and
the real median is 55 seconds; `usdc` has no history at all because cycle 1's
Base Sepolia legs predate the table; and **demo-internal's median is negative**,
which is FIX 1.

*(Re-measure at Section C rather than trusting these numbers — the deal book is
live and the figures move.)*

### New files (additive)

```text
src/lib/rails/history.ts            the aggregate query: settlements per rail,
                                    median and slowest duration, the
                                    did-not-settle-cleanly count
src/lib/rails/history.test.ts
src/components/rail-comparison.tsx  the table — a SERVER component
src/features/rail-comparison/       this manifest + fixtures
```

*`history.ts` sits in `src/lib/rails/` rather than the feature folder. Off the
kit's default, and deliberate: it matches cycle 3's precedent exactly
(`src/lib/reconciliation/`), on the same reasoning — a query module that reads
the app's own database is not feature-local code. Named here so it is never
discovered as an unexplained line in a diff.*

### Allow-list — existing files, each with its reason

```text
 1. src/lib/settlement/pending.ts       FIX 1 — resolvedAt takes the DATABASE's
                                        clock at lines 502 and 509. `sql` is
                                        ALREADY imported (line 26), so the fix
                                        is two words in two places.
                                        A MONEY-PATH FILE: re-approved before
                                        it is written, and the smoke path walks
                                        after it.
 2. src/lib/settlement/pending.test.ts  FIX 1's regression — a duration is
                                        never negative. A refusal may be
                                        re-asserted or strengthened, never
                                        deleted.
 3. src/lib/rails/types.ts              failureModes + verifiability declared
                                        on the SettlementRail interface, so no
                                        rail can join the comparison silently
 4. src/lib/rails/demo-internal.ts      its declarations
 5. src/lib/rails/usdc.ts               its declarations
 6. src/lib/rails/circle.ts             its declarations
 7. src/app/ops/deals/[id]/page.tsx     render the comparison inside stage 2,
                                        flag-gated
 9. scripts/eval-rail-comparison.mts    cycle 4's eval harness — the cases need
                                        the LIVE database, and case 5 needs a
                                        before/after snapshot of a whole deal.
                                        Read-only: it creates nothing.
 8. scripts/eval-circle-fiat.mts        cycle 2's eval harness holds a stub
                                        rail; adding failureModes +
                                        verifiability to the interface makes
                                        EVERY implementor need them. Two lines,
                                        no behaviour change — the harness
                                        compares nothing and renders nothing.
```

*Item 8 added 2026-09-24 as a stop-and-ask raised mid-A3, on Chetan's approval.*
**This was a gap in the design's contract, and it is the SECOND time the same
gap has appeared.** Cycle 3 added the identical file for the identical reason —
its allow-list item 13, when `listInbound()` joined the interface. The standing
lesson, worth carrying to the design kit rather than rediscovering at cycle 11:
**an interface change's allow-list must name every implementor, including the
fake ones.** A design that predicts the principle and not the consequence is
half a contract.

*Making the fields optional was considered and rejected, on cycle 3's own
words: "optional is how a rail ends up silently answering 'nothing arrived'
instead of 'I have no outside'." A red `tsc` here is the feature working.*

**Nine files. Anything else is a stop-and-ask, including a shared component, a
config, or a dependency. "It would be cleaner" is never sufficient.**

### Deliberately NOT on the allow-list

```text
src/components/pricing-form.tsx   The comparison is a SERVER-COMPONENT SIBLING.
                                  The <select> and its prose stay exactly as
                                  they are. If this file must change, that is a
                                  stop-and-ask, not a quiet edit.
```

### Untouchable

```text
src/lib/pricing/          NOT READ AND NOT CALLED by this feature. The txnCost
                          defect found at Discovery — the transaction cost
                          deducted from the supplier and flowing into
                          platformMargin while no account records the platform
                          paying a rail — is routed to CYCLE 6 and must not be
                          half-repaired here.
                          index.ts pinned: 2e69ac6a…
src/lib/money/            the parser. Not lifted this cycle.
                          index.ts pinned: f8d378d3…
src/lib/ledger/index.ts   the sole writer. This feature books nothing, reads
                          nothing from it, and calls none of it.
                          pinned: 0ba1953f…
src/lib/domain/states.ts  byte-identical. No state moves, in either direction.
                          pinned: 25b7d681…
migrations 0000–0007      never edited. THIS CYCLE WRITES NO MIGRATION — both
                          measured columns are aggregates over rows that
                          already exist, and both declared columns are
                          properties of the rail, which is code.
existing components       off-list, untouched.
```

### What Gate 0.5 verified in the code, and found better than designed

**1. FIX 1 is two words.** `pending.ts:26` already imports `sql` from
drizzle-orm, so `resolvedAt: new Date()` becomes ``resolvedAt: sql`now()` `` and
nothing else moves.

**2. The verifiability column needs no new component.**
`src/components/ui/provenance-badge.tsx:21` reads `if (trusted && !href)` — the
third provenance treatment already exists as a code path. `DESIGN_SYSTEM_NOTES.md`
reserved it at cycle 2's close with the line *"that distinction is the axis
cycle 4 compares rails on"*, and it is genuinely there:

```text
demo-internal   trusted=false      dashed, muted     our word only
usdc            trusted + href     solid, cobalt     you can open it
circle-fiat     trusted, no href   solid, unlinked   real, uncheckable
```

### The label that replaces a code change

`failureReason` has drifted into a repair log — the single recorded failure
across 36 rows reads *"REPAIR 2026-09-18: matched deposit a0afd5d4 which had
already settled"*. That is a human's note, not a rail failing.

**The column is titled "did not settle cleanly", not "rail failures"** — which
is *true* of a repair row, where the other would not be. No rule, no filter, no
data migration. The fix is the label.

### The smoke path (agreed at Gate 0.5)

```text
1. create invoice → approve → price → fund → supplier paid   (the spine)
2. open /pay/[invoiceId] as a debtor
3. switch role; each seat sees only its own surface
```

Walked at every section gate and after any prompt that modifies allow-list
item 1, which is a money-path file.

### Gate 0 baseline (2026-09-24, on `40d6033`, clean tree)

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             237 tests across 18 files, all passing
npm run build        succeeds — 12 routes, all dynamic
```

## Progress

| prompt | what | files | verified |
|---|---|---|---|
| Gate 0 | baseline recorded | — | ✅ 2026-09-24 |
| Gate 0.5 | contract verified line by line, rails set | `.env.example`, this manifest, `AGENTS.md` | ✅ 2026-09-24 |
| A1 | **FIX 1** — one duration, one clock. `resolvedAt` takes `sql\`now()\`` in `markSettled` and `markFailed`, plus two regression tests | **modified:** `pending.ts` (1), `pending.test.ts` (2) | ✅ 2026-09-24 · 239 tests · **proved by reverting**: −27 ms and −55 ms with the fix out |
| A2 | the history query — `summarise` (pure) + `loadRailHistory`, the median/slowest/did-not-settle-cleanly figures, and the impossible-duration exclusion | **new:** `src/lib/rails/history.ts`, `history.test.ts`, `src/features/rail-comparison/fixtures.ts` | ✅ 2026-09-24 · 252 tests · verified against the live database |
| A3 | the rail declarations — `failureModes` + `verifiability` on the interface, answered by all three rails, plus a test that they say something | **modified:** `types.ts` (3), `demo-internal.ts` (4), `usdc.ts` (5), `circle.ts` (6), `pending.test.ts` (2), `eval-circle-fiat.mts` (8 — **stop-and-ask, approved**) · `history.test.ts` (mine) | ✅ 2026-09-24 · 259 tests · build ✓ |
| A4 | the table on screen — inside stage 2, flag-gated, rendered only while the rail is still choosable | **new:** `src/components/rail-comparison.tsx` · **modified:** `/ops/deals/[id]/page.tsx` (7) | ✅ 2026-09-24 · 259 tests · build ✓ 12 routes |
| B | native polish — the vocabulary audit, the error sentence, and a Suspense boundary so a decision aid never blocks a pricing decision | **modified:** `rail-comparison.tsx` (mine), `/ops/deals/[id]/page.tsx` (7) | ✅ 2026-09-24 · 259 tests · build ✓ |
| C | the five evals, run against the live database | **new:** `scripts/eval-rail-comparison.mts` (9 — **stop-and-ask, approved**), `docs/product/rail-comparison/evals.md` | ✅ 2026-09-24 · **5 pass · 0 partial · 0 fail**, after hardening case 1 |

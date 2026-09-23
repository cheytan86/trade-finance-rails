# Manifest — reconciliation-ops (cycle 3) · branch `feat/reconciliation-ops`

## The contract (from docs/product/reconciliation-ops/design.md — verified at Gate 0.5, 2026-09-23)

**ENHANCE, with FIX A and FIX B named separately.** Additive by default;
**only the allow-list below may be modified**; an unnamed modification is a
stop-and-ask. Branch cut from `feat/circle-fiat` at `94a6398` — `main` holds
22 files and **zero** under `src/`, so branching from it would produce a tree
where every allow-listed file is missing. Same precedent as cycle 2, which cut
from `feat/settlement-usdc` for the same reason.

Flag `NEXT_PUBLIC_ENABLE_RECONCILIATION` — **absent means off, never an
error**, checked on the server as well as in the browser.

**Two slices. This run builds SLICE 1 only** (epics A–E). Slice 2 (epic F —
remember the sender) is a separate Develop run against the same design file.

### Why the cycle exists, in one number

Reconciling the live Circle sandbox against `settlement_events` on 2026-09-21:
**13 deposits · 10 attributed · 3 unattributed · $50,105.00**. The release
record had stated as fact that one deposit worth $100 was unreconciled, and
that statement was the evidentiary basis of a go/no-go decision. It was wrong
by $50,005 — because nothing in the product could check.

*(Baseline moved 2026-09-22: a Virtual Account Number test deliberately added
two deposits, so the live figures are now 15 · 10 · 5 · $50,143.25. Both test
deposits are genuine unattributed payments and are legitimate eval fixtures.
**Re-measure at Section C rather than trusting either number.**)*

### New files (additive)

```text
src/app/ops/payments/page.tsx              the queue
src/app/ops/payments/[paymentId]/page.tsx  the attribution view
src/lib/reconciliation/*.ts                queries + the attribution action
src/lib/reconciliation/*.test.ts
src/components/payment-*.tsx               the queue row and the age affordance
drizzle/0007_*.sql                         ONLY after per-change re-approval
```

### Allow-list — existing files, each with its reason

```text
 1. src/db/schema.ts                the `unapplied` account kind; the
                                    inbound_payments table
 2. src/lib/rails/types.ts          the listInbound() capability on the Rail
                                    interface
 3. src/lib/rails/circle.ts         implement listInbound() from the existing
                                    listDeposits()
 4. src/lib/rails/usdc.ts           declare listInbound UNSUPPORTED — no payment
                                    arrives from outside on that rail
 5. src/lib/rails/demo-internal.ts  declare listInbound unsupported
 6. src/lib/rails/index.ts          export the capability through the registry
 7. src/lib/rails/verify-circle.ts  FIX B — ambiguity parks rather than fails;
                                    A3 — exclude spent payments from candidates
 8. src/lib/settlement/pending.ts   FIX A — the replacement key scheme;
                                    C3 — settle a parked row on hand-attribution
 9. src/app/ops/page.tsx            the flag-gated link and unattributed count
```

```text
10. src/lib/rails/verify-circle.test.ts    FIX B — the ambiguity assertion moves
                                           from `throws` to `pending with a
                                           reason`. The refusal to guess is
                                           RE-ASSERTED, never removed.
11. src/lib/settlement/pending.test.ts     FIX A — pin that one leg can take one
                                           movement today, then prove the new
                                           key permits a second
12. src/lib/rails/circle.test.ts           only if matchInboundDeposit's
                                           signature change ripples
13. scripts/eval-circle-fiat.mts           cycle 2's eval harness holds a stub
                                           rail; adding listInbound() to the
                                           interface makes EVERY implementor
                                           need it. Four lines, no behaviour
                                           change — the harness never asks a
                                           rail what has arrived.
```

**Thirteen files. Anything else is a stop-and-ask, including a shared component,
a config, or a dependency. "It would be cleaner" is never sufficient.**

*Item 13 added 2026-09-23 as a second stop-and-ask, during A3. Making
`listInbound` OPTIONAL was considered and rejected: optional is how a rail ends
up silently answering "nothing arrived" instead of "I have no outside", which
is the false statement B1.3 exists to prevent. The interface should force every
rail to say which it is.*

*Items 10–12 added 2026-09-23, on Chetan's approval, as a stop-and-ask raised
mid-A2.* **This was a gap in the design's contract rather than a discovery
about the code:** the allow-list named nine source files and never named their
tests, but a FIX by definition changes behaviour existing tests assert, so
every FIX in this cycle implies touching the test beside it. The standing rule
for these three: **a refusal may be re-asserted or strengthened, never
deleted.** A FIX that makes a test disappear is a FIX that removed a guard.

### Untouchable

```text
src/lib/domain/states.ts   byte-identical. Its line 3 already says the full
                           machine including reversals is later-cycle design,
                           and reversals are OUT of this cycle's scope.
src/lib/money/             the parser. NOT lifted this cycle.
src/lib/ledger/index.ts    READ-ONLY USE. This feature calls bookMovement and
                           does not modify the sole writer. The contract's most
                           load-bearing line: this cycle adds a new way to
                           DECIDE what books, never a new way to book.
vercel.json                does not exist in this repo — deploy config lives in
                           the Vercel dashboard. Corrected at Gate 0.5; the
                           contract inherited the name from the kit template.
migrations 0000–0006       never edited.
existing components        off-list, untouched. /ops/deals/[id] gains nothing —
                           a hand-attributed payment renders there through the
                           movements list that already exists, because it is an
                           ordinary settlement_event like any other.
```

### The two repairs, which are prerequisites rather than improvements

**FIX A — one leg may receive more than one movement.** `idempotencyKeyFor()`
returns `` `${type}:${invoiceId}` `` and the column is `.unique()`: *"one leg,
one movement, one in-flight row."* A part payment is one leg with two
movements, so Postgres forbids it. **Eval case 2 cannot pass against the
current schema.** The key is replaced, never removed:

```text
gate / webhook (unchanged)   `${type}:${invoiceId}`      one automatic booking
hand-attribution (new)       `match:${externalPaymentId}` one payment, once, ever
```

**FIX B — an ambiguous match parks the leg; it does not fail it.** The refusal
to guess is correct. Catching it as a mismatch and calling `markFailed()` is
not — `failed` is terminal, nothing actually failed, and a retry opens a leg
whose window excludes both deposits, so the money becomes matchable by nothing.
This is how deposit `99bea655` was orphaned.

### The smoke path (agreed at Gate 0.5)

```text
1. create invoice → approve → price → fund → supplier paid   (the spine)
2. open /pay/[invoiceId] as a debtor
3. switch role; each seat sees only its own surface
```

Walked at every section gate and after any prompt that modifies an
allow-listed existing file.

### Gate 0 baseline (2026-09-23, on `94a6398`, clean tree)

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             194 tests across 16 files, all passing
npm run build        succeeds — 10 routes, all dynamic
```

---

## Progress

| prompt | what | files | verified |
|---|---|---|---|
| Gate 0 | baseline recorded | — | ✅ 2026-09-23 |
| Gate 0.5 | contract verified, rails set | `.env.example`, this manifest, `AGENTS.md` | ✅ 2026-09-23 |
| A1 | the world — inbound payment shape + fixtures for all five eval cases | **new:** `fixtures/payments.ts`, `fixtures/legs.ts`, `fixtures/index.ts`, `fixtures/fixtures.test.ts` · **modified:** `src/lib/rails/types.ts` (allow-list 2) | ✅ 2026-09-23 · 210 tests |
| A2 | states and transitions — the derived state model, FIX A, FIX B, A3 | **new:** `attribution.ts`, `attribution.test.ts` · **modified:** `verify-circle.ts` (7), `pending.ts` (8), `verify-circle.test.ts` (10), `pending.test.ts` (11) | ✅ 2026-09-23 · 237 tests · build ✓ |
| smoke | the spine walked on the fiat rail after A2 touched two money-path files | deal `9cc15acd`, face 200.00 → `settled`, five legs, **all five booked unattended** (`applied=5`), `client_collections` 0.00, net 0.00 | ✅ 2026-09-23 · Chetan |
| A3a | the rail capability + the queue | **new:** `src/lib/reconciliation/queue.ts`, `src/components/payment-state-pill.tsx`, `src/app/ops/payments/page.tsx` · **modified:** `types.ts` (2), `circle.ts` (3), `usdc.ts` (4), `demo-internal.ts` (5), `pending.test.ts` (11), `scripts/eval-circle-fiat.mts` (13) | ✅ 2026-09-23 · 237 tests · build ✓ · live: 17 payments, 5 unattributed, $50,143.25 |

### Built but NOT YET WIRED, as at A2

`matchInboundDeposit`'s `spent` parameter defaults to an empty set, and
`circle.ts:155` still calls it without one. The filter is **tested and inert**:
A3's benefit is not realised in production until a caller passes the real
`settlement_events.evidence_ref` set, which needs a database query and
therefore belongs with the queries module. Recorded here so "A3 done" is not
read off the test file.

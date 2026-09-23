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

**Nine files. Anything else is a stop-and-ask, including a shared component,
a config, or a dependency. "It would be cleaner" is never sufficient.**

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

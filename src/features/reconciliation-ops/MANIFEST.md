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
14. scripts/eval-reconciliation.mts        cycle 3's eval harness — the five
                                           cases need state a person cannot
                                           arrange by clicking
13. scripts/eval-circle-fiat.mts           cycle 2's eval harness holds a stub
                                           rail; adding listInbound() to the
                                           interface makes EVERY implementor
                                           need it. Four lines, no behaviour
                                           change — the harness never asks a
                                           rail what has arrived.
```

**Fourteen files. Anything else is a stop-and-ask, including a shared component,
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
| schema | `unapplied` account kind · `attribution_reason` enum · `inbound_payments` table · `unapplied` added to CLIENT_MONEY_KINDS | **new:** `drizzle/0007_reconciliation.sql` · **modified:** `src/db/schema.ts` (1), `drizzle/meta/_journal.json`, **`src/lib/ledger/index.ts` (untouchable — one line, on Chetan's explicit approval)** | ✅ 2026-09-23 · applied to the live database and read back |
| C | the five evals, run against the real slice | **new:** `scripts/eval-reconciliation.mts` (14), `docs/product/reconciliation-ops/evals.md` · **modified:** `pending.ts` (8), `pending.test.ts` (11) | ✅ 2026-09-24 · **5 pass · 0 partial · 0 fail** |
| B2 | native polish — the vocabulary audit and the states nobody designed | **modified:** `queue.ts`, `/ops/payments/page.tsx`, `/ops/page.tsx` (9) | ✅ 2026-09-23 · 237 tests · build ✓ |
| smoke 2 | the spine re-walked after A3–B1 touched `/ops/page.tsx` — INV-2323-034 to `disbursed`, the pay page, the role gate | deal `03b07e7e` on demo-internal | ✅ 2026-09-23 · Chetan |
| B1 | every rail asked, not one — the hard-code removed | **modified:** `queue.ts`, `/ops/payments/page.tsx`, `/ops/payments/[paymentId]/page.tsx`, `actions.ts` (all mine), `/ops/page.tsx` (9) | ✅ 2026-09-23 · 237 tests · build ✓ |
| A gate | tsc 0 · lint 0 · 237 tests · build ✓ 12 routes · every surface 200 · zero data-client imports in the feature folder · no model calls | — | ✅ 2026-09-23 |
| A5 | the human gate and the write — the attribution action | **new:** `src/lib/reconciliation/actions.ts`, `src/lib/reconciliation/booked.ts`, `src/components/payment-attribute-form.tsx` · **modified:** `candidates.ts`, `/ops/payments/[paymentId]/page.tsx` (both mine) | ✅ 2026-09-23 · 237 tests · build ✓ |
| A4 | the permission gate + the flag-gated ops index link | **modified:** `src/app/ops/page.tsx` (9) | ✅ 2026-09-23 · flag-off and wrong-seat both proved by curl |
| A3b | the attribution screen — candidates, refusals, no ranking | **new:** `src/lib/reconciliation/candidates.ts`, `src/app/ops/payments/[paymentId]/page.tsx` · **modified:** `attribution.ts`, `fixtures/legs.ts`, `fixtures/payments.ts`, `queue.ts` (all feature-folder / new) | ✅ 2026-09-23 · 237 tests · build ✓ 12 routes |
| A3a | the rail capability + the queue | **new:** `src/lib/reconciliation/queue.ts`, `src/components/payment-state-pill.tsx`, `src/app/ops/payments/page.tsx` · **modified:** `types.ts` (2), `circle.ts` (3), `usdc.ts` (4), `demo-internal.ts` (5), `pending.test.ts` (11), `scripts/eval-circle-fiat.mts` (13) | ✅ 2026-09-23 · 237 tests · build ✓ · live: 17 payments, 5 unattributed, $50,143.25 |

### The one untouchable line that moved, and why

`src/lib/ledger/index.ts` is READ-ONLY USE in this contract. One line changed,
with Chetan's explicit approval after a stop-and-ask: `"unapplied"` was added
to `CLIENT_MONEY_KINDS`.

**Leaving it out would not have missed a label — it would have made that
file's own assertion quietly wrong.** `isClientMoney()` exists (cycle 2, FIX 2)
"so the segregation can be asserted and displayed, not merely intended", and
unapplied cash is emphatically client money: somebody paid it and it is not the
platform's. The first part payment to book would have rendered as platform
funds. **`bookMovement` was not touched** — this cycle still adds no new way to
book.

### FIX B had a second direction, and the eval found it (2026-09-24)

FIX B at A2 covered **two deposits matching one leg** — the matcher parks
instead of throwing. The mirror, **one deposit that a second leg also
recognises**, went through `completeSettlement`'s `claimed` branch and called
`markFailed()`, killing a leg nothing was wrong with. Cycle 2's own comment
there read *"this is a reconciliation exception (cycle 3)"*.

Found by hardening case 3 after all five passed on the first clean run — which
is exactly what the playbook's "harden one until you are genuinely unsure" is
for. Now parks. `pending.test.ts`'s assertion moved from `status === "failed"`
to `status is still open, resolvedAt is null, nothing booked` — a refusal
re-asserted and strengthened, never deleted.

### The hard-code Chetan found, and what it cost (2026-09-23)

A3 built the queue against `const RAIL = "circle-fiat"`. Invisible while one
rail had an outside — and it made the `unsupported` branch **unreachable**.
That branch was written carefully, argued for in a commit message, and was
dead code: a person funding a demo-internal deal saw a queue full of other
people's payments with no explanation of why theirs was absent. **Chetan hit
exactly that** with INV-2323-034 and asked whether it was broken.

**This project's recurring defect shape, for the fifth time**: described but
not performed. `fee_income`, `statement-line`, `webhook_outcome.ignored`, the
`unapplied` account — and now an honest error message nobody could reach.

Fixed by asking EVERY rail (`loadAllQueues`) and rendering the unsupported ones
with their reason. The rail is also now DISCOVERED from a payment reference
(`findPayment`) rather than assumed, on the detail page and in the action — the
browser posts decisions, not lookups, and letting a URL name the rail would let
it choose which one the server consults.

### Known shape this will have to grow

`listInbound()` returns ONE list per rail. If the platform ever holds two
Circle wallets — a disbursement wallet and a collections wallet, which needs
institutional subaccounts and therefore a commercial agreement — that is one
rail with two balances, and the listing would need to say which wallet each
payment landed in. Recorded so it is not rediscovered.

### Case C is deferred, by name (2026-09-23)

The design's C2.1 said "a part payment's remainder books to `unapplied`". At
A5 that turned out to describe something that does not happen: a part payment
has **no** remainder — the money is fully applied and the LEG is short. A
leftover only exists on an **over**payment, which is a different case needing
its own control and its own decision by ops.

**So A5 attributes up to what is owed and stops.** A surplus stays unattributed
and visible at the rail, which is already correct behaviour. `unapplied` ships
**unused in slice 1** — a cost named rather than hidden, because `fee_income`,
`statement-line` and `webhook_outcome.ignored` were all declared-before-used
and two of them caused real defects. Chetan approved this reading on 2026-09-23.

**The follow-up, named so it is not rediscovered:** an overpayment control —
`debtor_cash −X / unapplied +X` when the payer is known but the invoice is not.
It only works when ops can name the counterparty, because double-entry needs
both sides and "whose money is this?" is the question the exception poses.

### Built but NOT YET WIRED, as at A2

`matchInboundDeposit`'s `spent` parameter defaults to an empty set, and
`circle.ts:155` still calls it without one. The filter is **tested and inert**:
A3's benefit is not realised in production until a caller passes the real
`settlement_events.evidence_ref` set, which needs a database query and
therefore belongs with the queries module. Recorded here so "A3 done" is not
read off the test file.

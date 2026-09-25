# Develop — Fiat rail (Circle sandbox, cycle 2) · evidence

Single slice (design Build order: one slice, async only). Built 2026-09-15,
evals and Section D 2026-09-18. Branch `feat/circle-fiat`, cut from
`feat/settlement-usdc` at `2a81fa4` — `main` holds no app.

Second cycle under the active boundary: **ENHANCE, with FIX 1 declared at
design and FIX 3, 4 and 5 added during Develop** (recorded in `design.md`, not
absorbed silently).

## Gate 0 — baseline (recorded 2026-09-15, real output)

```text
npx tsc --noEmit    0 errors
npm run lint        clean
npm test            117 tests, 12 files, all passing
npm run build       compiled; 9 routes
branch              feat/settlement-usdc (cycle-2 branch cut from it)
```

## Gate 0.5 — contract verification

Verified line by line. **Three discrepancies reported, none absorbed:**

- `src/lib/deals/queries.ts` does not exist → corrected to `src/lib/queries.ts`,
  the host's shared query module, which cycle 1 also used. No new file; the
  boundary is unchanged in size.
- The branch parent is `feat/settlement-usdc`, not `main` — a deliberate
  deviation from the kit's default, because `main` has no application.
- The working tree was dirty; the planning documents and cycle 1's deploy
  record were committed as `2a81fa4` before branching.

Rails set: branch, flag off in both env files, the manifest, the per-feature
`AGENTS.md` block on the branch.

## The final gate (2026-09-18, commit `41787cf`)

```text
npx tsc --noEmit    0 errors
npm run lint        0 problems
npm test            179 tests, 16 files, all passing   (from 117/12 at Gate 0)
npm run build       compiled; 9 routes
```

**Flag-off proof** — built and served with `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL`
absent from the environment entirely, not set to a falsy value:

```text
build with the flag absent            compiled successfully  (absent is off, never an error)
POST /api/webhooks/circle             404 "fiat rail disabled"
circle-fiat options rendered          0
/  /ops  /ops/ledger  /supplier  /funder    200, 200, 200, 200, 200
```

**Smoke path** (agreed at Gate 0.5), all three flows:

```text
1. ops pipeline on demo-internal    20/20 spine integration tests, real database
2. public debtor page               /pay/<demo-internal deal>  200
                                    /pay/<settled fiat deal>   200
3. balances derived, stored nowhere balance columns in schema: 0
                                    balances() is SUM over ledger_entries
```

**Data-boundary audit:**

```text
db imports under src/lib/rails/     none — the seam stays framework-free
SAND_ keys in source                0
.env ever committed                 0
0x+64hex literals in source         2, both benign: a transaction hash in
                                    cycle 1's manifest, and the universally
                                    published Anvil test key in wallets.test.ts
```

**Manifest reconciliation** against `git diff --name-only feat/settlement-usdc`
— 51 files, 12 commits. Every file is accounted for by the contract except
two, both recorded rather than explained away:

- `.gitignore` — one line (`.replay-key.pem`), never declared. The replay key
  is a throwaway generated locally and must not be committed; the entry is
  correct and the omission was in the manifest, not the change.
- `src/components/check-status-button.tsx` — a new file the design's new-files
  list does not name. The design put the Check-status control inside
  `in-flight-strip.tsx`; it became its own client component because the strip
  is server-rendered and the control needs an action. The split is right; the
  manifest should have said so when it happened.

---

## 1 · Slice scope

One capability, end to end: **a receivables deal settling on a rail that
cannot answer inside the request that asked it.** Cycle 1 proved the rail
abstraction on rails that confirm immediately. Circle does not — it answers
`pending` — and this slice is the seam surviving that.

Entered from the ops queue at `/ops`, carried through `/ops/deals/[id]`, with
the debtor's leg on the public `/pay/[invoiceId]`. The rail is chosen per deal
at the pricing step and cannot change afterwards.

The one new route is `/api/webhooks/circle` — **this application's first route
handler, and its first unauthenticated write path.**

Deferred by design: part payments and reconciliation exceptions (cycle 3 —
this cycle settles exact amounts only and says so); hybrid mode, moved out on
2026-09-15 to cycle 6, because hybrid is two rails inside one deal and
`invoices.rail` is one column, so the resolution is the programme rather than
a schema patch here.

## 2 · User interaction

**Ops prices the deal** and picks the settlement rail: `demo-internal`, `usdc`,
or `circle-fiat`. The form states plainly that on the fiat rail a leg is
*initiated* now and confirmed later, and that the deal does not advance until
it confirms.

**Ops presses a money gate** — Fund, Disburse, Pay out, Pay residual. A
confirm dialog shows the exact ledger entries and, on the fiat rail, the
transfer about to happen. On confirm the intent is recorded **before** the
money is instructed, the rail is asked, and the answer is one of three:
settled, pending, or failed.

**A pending leg becomes visible, not invisible.** The in-flight strip appears
on the deal, the queue marks it, the ledger gains an In-flight panel, and the
supplier and funder see the money as *expected* — never received. Balances do
not move. The gate for the next leg refuses while money is in flight.

**A leg finishes in one of two ways, and they are the same way.** Circle
delivers a signed webhook, or the operator presses **Check status**. Both call
`completeSettlement`, which re-reads Circle's own record. There is no second
booking path.

**The debtor pays on a public page** with no seat and no login, seeing the
face value exactly — never a moving number, because overdue interest is borne
by the supplier's residual.

**The human gates refuse to do anything automatically.** Nothing books without
a person pressing a gate; nothing advances without the rail's own record
agreeing; and a refusal is always a sentence naming what happened.

## 3 · Data used

**Synthetic only. No live data source was connected in any environment.** The
parties are invented companies (Amber Textiles, Northgate Capital, Meridian
Retail); the seed builds a backdrop of deals across the pipeline including
in-flight and failed fiat legs. Fixtures are typed against the generated
Drizzle types in `src/db/schema.ts`, so a schema change breaks a fixture at
compile time rather than at runtime.

**Money is real in the sense that matters and worthless in the sense that
matters more.** Circle sandbox dollars are real API calls against a real
ledger Circle maintains, denominated in money Circle invented. Base Sepolia
USDC is a real transfer on a real chain of a token with no value. The client
refuses any Circle key without a `SAND_` prefix, so a production key cannot be
used by accident.

**Tables this slice writes** (design data contract, plus one amendment):

```text
pending_settlements       new — the in-flight record. FIX 1's repair.
settlement_destinations   new — where a party's money goes, per rail
webhook_deliveries        new — every delivery, including every refusal
invoices                  rail column already existed; status advanced
settlement_events         unchanged shape; new evidence_kind in use
ledger_entries            unchanged. src/lib/ledger remains the sole writer.
```

`pending_settlements.entries` (jsonb, migration 0006) was a schema amendment
approved during Develop: `completeSettlement` may run hours after the gate,
and payout and residual entries depend on overdue interest measured from
`new Date()`. Recomputing at completion could book numbers no human ever saw.
Freezing the approved entries keeps the confirm dialog's promise true across
an asynchronous settlement — **what was approved is what books.**

## 4 · Eval cases

The five written in `design.md` before any code existed:

1. **Happy path** — a fiat deal settles asynchronously, end to end: every leg
   in flight, then settled; distinct references; every movement sums to zero.
2. **Edge** — a forged delivery is refused before being parsed for meaning,
   recorded as a refusal, and books nothing.
3. **Edge** — duplicate and out-of-order delivery converge: the same
   completion three times books once, and a completion arriving before its
   pending sibling produces an identical ledger.
4. **Edge** — Circle reports failure: nothing books, the leg un-flights with
   Circle's own reason, and the retry creates a new row rather than
   overwriting the failed one.
5. **Boundary** — in-flight money is never money: balances do not move while a
   leg is in flight, and an executed movement is never silent (FIX 1, proved
   on the USDC rail where the defect lived).

## 5 · Eval results

Run 2026-09-18 against commit `41787cf`. Full record in `evals.md`.

| # | Case | Expected | Actual | Verdict |
|---|---|---|---|---|
| 1 | Happy path | 5 legs, 5 distinct refs, Σ=0, `settled` | 5 legs, 5 circle-payment-ids, every Σ=0, `settled`; funder +0.71, platform +0.24, supplier 134.05, client money 0.00 — all equal to expected | **PASS** |
| 2 | Forged delivery refused | 403, ledger identical, 2 refusal rows | 403 forged, 403 unsigned; ledger 12/Σ0 before and after; 2 rows, `external_id` NULL | **PASS** |
| 3 | Duplicate + out-of-order | one event; orderings identical | 1 event each; both orderings identical row for row | **PASS** |
| 4 | Circle reports failure | nothing booked, 2 rows, retry completes | Circle's own reason carried; 16→16 entries; failed row kept; retry settled as a new row | **PASS** |
| 5a | Balances still while in flight | map unchanged | unchanged, asserted and witnessed live | **PASS** |
| 5b | FIX 1 on the USDC rail | durable pending row with the reference | real broadcast `0xaf10ec6f…` block 46971837; durable row with the hash; nothing booked. Row status `failed`, not `initiated` | **PARTIAL** |

**No percentage is quoted.** 4 pass · 1 partial · 0 fail.

Case 5(b) is a partial on wording, not behaviour. The case says "a durable
**pending** row"; A3 later decided a throwing `verify` means the rail's record
*contradicts* what was expected — a mismatch, which must stay loud — and fails
the leg. The row is durable and carries the reference either way, which is
what FIX 1 is about. Recorded as a partial rather than quietly re-graded,
because rewriting a success criterion to match the result is how evidence
stops being evidence.

## 6 · Improvement made

**Before.** All ten FIX 1 assertions ran against a synthetic stub shaped like
`demo-internal`. That proves the mechanism is rail-neutral — a real result,
since `completeSettlement` being the single booking path *is* the repair — but
it does not prove the repair on the rail that carried the defect. Graded
against case 5(b) as written, that was a gap.

**Change.** `scripts/eval-circle-fiat.mts` runs case 5(b) against the **real**
`usdcRail` — real prepare, real execute, a real Base Sepolia broadcast — with
only `verify` replaced by one that throws. Once, as an eval, rather than in
`npm test`, so the suite stays fast and no test run moves money.

**After.** $2.00 of testnet USDC moved (funder 19.03 → 17.03), verification
failed, and the durable row survived carrying the transaction hash with
nothing booked. FIX 1 is now proved where the defect lived, with a hash anyone
can open on Basescan. The gap that remains is the wording, recorded above.

## 7 · Known limitations

1. **The flag is off by default and the branch is unmerged.** With
   `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` absent the host is what it was: the
   webhook door answers 404, the rail option does not render, every existing
   surface is unchanged. Proved at the final gate, not asserted.
2. **Nobody has been paid.** Circle sandbox dollars and Base Sepolia USDC are
   real movements of worthless money. Every surface that renders an inbound
   fiat leg says the platform is standing in for the counterparty's bank,
   exactly as the demo wallets stand in on USDC.
3. **The overdue path is untested on this rail.** The pinned example
   (22.22 / 20.00 / 2.22) needs a past-due deal; case 1's deal settled early.
   It stands on cycle 1's evidence and the arithmetic is rail-independent — but
   on the fiat rail it is unproven.
4. **Inbound matching is by amount and arrival window, and that is a real
   limit, not a detail.** A deposit has no id until it exists, so it is
   recognised rather than looked up. Two deals of the same amount in flight
   together are a named refusal pointing at cycle 3 — correct, but a refusal,
   not a resolution. There is no control to match a payment by hand; that is
   cycle 3's job. One deposit (`99bea655`, 100.00) is unreconciled today
   because of defect 6 and remains so.
5. **The repayment date is the moment Circle confirmed, not the moment the
   buyer paid.** On immediate rails these were the same instant; asynchrony
   splits them and nothing in the design names which one is the discharge
   date. It is immaterial in a sandbox where confirmation takes seconds. It is
   not immaterial when a wire takes three days and overdue interest is borne by
   the supplier's residual. Open decision, recorded rather than defaulted.
6. **The first genuinely unattended settlement has not happened.** Circle
   cannot reach a laptop, so every delivery here was either a signed local
   replay or an operator pressing Check status. Both go through the one
   booking path, so the ledger cannot tell — but the claim "it settles with
   nobody watching" is Deploy's to prove, not this phase's.

## 8 · Evidence walkthrough

Ops opens a submitted deal, reads the invoice as a document, and approves it.
At the pricing step they set the rate card and choose **Fiat · Circle sandbox
(settles later)** — the form says, before they commit, that legs on this rail
are initiated now and confirmed later.

They press **Fund**. A dialog shows the exact ledger entries and the transfer
about to happen. They confirm. The money leaves the funder — and the deal does
not advance. Instead an in-flight strip appears, the queue marks the deal, and
**the balances do not move**. This is the boundary moment of the whole cycle:
the money is real, it is gone, it is recorded as intended, and it is not yet
money. The Disburse gate refuses while it is in flight, and says why.

Minutes later Circle delivers a signed webhook. The body is never believed —
it only prompts a re-read of Circle's own record. The movement books with a
`circle-payment-id`, the balances move for the first time, and the deal
advances to `funded`. An operator who does not want to wait presses **Check
status** instead, which does exactly the same thing through exactly the same
function.

The same shape repeats through disbursement, the debtor's public payment,
the funder's payout and the supplier's residual. At the end: five legs, five
distinct Circle references, every movement summing to zero, and
`client_collections` back at zero — the platform a conduit, never a
beneficiary.

And if a forged delivery arrives at that public door, it is refused before the
body is read for meaning, recorded as a refusal, and books nothing. That is
the other boundary moment, and it is the one that matters most: the door is
open to the whole internet, and it opens for exactly one thing.

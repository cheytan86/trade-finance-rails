# Evals — Fiat rail (Circle sandbox, cycle 2)

Run 2026-09-18 against the built slice, on the real Circle sandbox and real
Base Sepolia. The five cases are the ones written in `design.md` **before any
code existed**, so this records the build against what was agreed rather than
against what turned out to be convenient.

No model calls anywhere in this feature: **these evals cost nothing to run** —
except $2.00 of testnet USDC, which is worthless by construction, and three
sandbox payouts denominated in money Circle invented.

**Verdicts so far: 3 pass · 1 partial · 1 not yet run.** No percentage is
quoted, because case 1 is ungraded — it is witnessed through the UI, and that
walkthrough has not happened yet. A score computed over four of five cases
would be a score of the four that were easy to reach.

| # | Case | Verdict | How it was run |
|---|---|---|---|
| 1 | Happy path — five legs settle asynchronously | **not yet run** | UI walkthrough (Chetan) |
| 2 | A forged delivery is refused | **PASS** | real HTTP, `replay-circle-webhook.mts` |
| 3 | Duplicate and out-of-order delivery converge | **PASS** | `eval-circle-fiat.mts` |
| 4 | Circle reports failure | **PASS** | `eval-circle-fiat.mts` |
| 5 | In-flight money is never money | **(a) PASS · (b) PARTIAL** | tests + a live Base Sepolia broadcast |

---

## 1 · Happy path — a fiat deal settles asynchronously, end to end

**Expected:** all legs initiated on `circle-fiat`, each visibly in flight, each
settled by a signed webhook; distinct Circle references per leg; every
movement's entries sum to zero; the pinned overdue example still reproduces to
the cent (22.22 / 20.00 / 2.22).

**Verdict: NOT YET RUN.** Deliberately not automated. Cycle 0's happy-path
evidence is "Chetan's own walkthrough, not a fixture", and cycle 1's is five
real transaction hashes from a deal carried through the UI. A harness driving
the settlement module is not evidence that a *deal completes* — it is evidence
that the module works, which cases 3, 4 and 5 already establish. The
walkthrough is the eval.

Prerequisites verified 2026-09-18 and all green: Circle sandbox balance
$50,000.50; one registered wire account (Wells Fargo ****0010, `complete`);
the platform destination row present, with supplier and funder resolving to it
by design — the platform stands in for the counterparties' banks exactly as
the four demo wallets do on USDC, and every surface rendering an inbound fiat
leg says so.

---

## 2 · Edge — a forged delivery is refused

**Expected:** a body with an invalid signature, and one with no signature, are
both refused *before being parsed for meaning*, recorded in
`webhook_deliveries` with `signature_valid = false`, and book nothing.
*Checkable: the ledger is byte-identical before and after; two refusal rows
exist.*

**Verdict: PASS.** Both halves over real HTTP against the running app:

```text
forged (signature computed over a DIFFERENT body)  -> 403 signature refused
no X-Circle-Signature header at all                -> 403 signature refused

ledger_entries   12 entries, Σ = 0   before
ledger_entries   12 entries, Σ = 0   after

webhook_deliveries:
  signature_valid=false  outcome=refused-signature  external_id=null
  signature_valid=false  outcome=refused-signature  external_id=null
```

The `external_id=null` on both rows is the case's real claim showing up in the
data. The column is populated from the body's own payout id — and it is empty,
because the refusal happened before the body was ever read for meaning. A
refusal that parsed first and rejected afterwards would have left the id
behind.

---

## 3 · Edge — duplicate and out-of-order delivery converge

**Expected:** the same completion delivered three times books once (the second
and third hitting `ledger-already-recorded`); and a `complete` delivered
*before* its `pending` sibling produces a ledger identical to the in-order run.
*Checkable: one settlement event; two orderings compared row for row.*

**Verdict: PASS.**

```text
in order      leg in flight → one completion books it → settled
              second delivery  no-op
              third delivery   no-op
              settlement events for the invoice: 1

out of order  the completion arrives FIRST and books
              the late "pending" sibling arrives after → changes nothing
              settlement events for the invoice: 1

both orderings, compared row for row: IDENTICAL
```

Why it cannot fail is more interesting than that it passed. `completeSettlement`
never reads the delivery's *claim* — the body is a doorbell, and the only thing
it does is prompt a re-read of the rail's own record. A notification that
arrives early therefore carries no information to be early *with*. The
ordering guarantee is not defended against; it is unreachable by construction.

---

## 4 · Edge — Circle reports failure

**Expected:** a payout Circle ultimately fails books nothing, un-flights the
leg with Circle's own reason on screen, leaves the deal re-initiable, and the
re-initiation creates a **new** pending row rather than overwriting the failed
one. *Checkable: zero ledger entries; two pending rows; the deal completes on
the retry.*

**Verdict: PASS.**

```text
leg outcome            failed
reason carried         "payout declined by the beneficiary bank"
                       — Circle's own words, not a generic message
ledger entries         16 → 16   (nothing booked)
ledger Σ               0
rows after failure     1, status=failed
retry                  settled
rows after retry       2 — a NEW row; the failed attempt survives as history
```

The failed attempt keeping its own row is the part worth stating plainly: a
system that overwrote it would lose the fact that money was once instructed
and declined, which is exactly the class of fact cycle 3's reconciliation work
depends on.

---

## 5 · Boundary — in-flight money is never money, and an executed movement is never silent

Two halves of one limit, graded separately.

### (a) Balances do not move while a leg is in flight — **PASS**

`balances()` returns the same map before an initiation and while the leg is in
flight, and changes only when the webhook books. Asserted in
`src/lib/settlement/pending.test.ts` and witnessed live at A6, where a fiat leg
was initiated, the pending row recorded with its reference, and the balances
re-read unchanged.

### (b) FIX 1, proved on the USDC rail — **PARTIAL**

**Expected:** a settlement whose `verify` throws after a successful `execute`
leaves a durable pending row carrying the rail's reference — asserted against
the **USDC** rail as well as Circle, since that is where the defect lives
today.

**What was run.** The real `usdcRail` — real `prepare`, real `execute`, a real
Base Sepolia broadcast — with only `verify` replaced by one that throws. Not a
stub of the rail; the rail, with the failure the case is about.

```text
broadcast      2.00 testnet USDC, funder → platform
transaction    0xaf10ec6fd2082d8beefc4e2a103f7ed178011223485821f80e7ce5fc074a255b
on-chain       status success, block 46971837
wallets        funder 19.03 → 17.03   platform 1.10 → 3.10

durable row survives the failed verify   1 row
it carries the transaction hash          yes
ledger entries                           18 → 18  (nothing booked)
ledger Σ                                 0
```

**The money moved and the system still has the record.** Before A2 this exact
sequence — broadcast succeeds, verification fails — left nothing behind at all.
That is the defect the design found, and this is it repaired on the rail where
it actually lived.

**Why PARTIAL and not PASS.** The case as written says "a durable **pending**
row". The row is durable and carries the reference, but its status is
`failed`, not `initiated`. That is not a defect — it is A3's decision, taken
after this case was written: a throwing `verify` means the rail's record
*contradicts* what was expected (wrong amount, wrong recipient, wrong chain),
which is a mismatch and must stay loud, rather than a payment that has not
arrived yet. A3 introduced the three-outcome `verify` precisely so that "not
yet" and "no" stop being the same answer.

So the wording predates the distinction it is being graded against. Recorded
as PARTIAL rather than quietly re-graded, because the honest resolution is a
**design amendment** — "durable pending row" becomes "durable row" — and that
is Chetan's call to make in `design.md`, not something an eval run should
decide about its own success criteria.

---

## The improvement (Section C's required step)

**Before:** all ten FIX 1 assertions in `pending.test.ts` ran against a
synthetic stub shaped like `demo-internal` (`instantRail`,
`stallsAfterSending`). That proves the mechanism is rail-neutral — a real
result, since `completeSettlement` being the single booking path is the
repair — but it does not prove the repair on the rail that carried the defect.
Graded against case 5(b) as written, that was a gap, and grading it a pass
would have produced exactly the untested-looking table the kit warns about.

**Change:** `scripts/eval-circle-fiat.mts` (allow-list amendment 25) now runs
case 5(b) against the real USDC rail with a real broadcast — once, as an eval,
rather than in `npm test`, so the suite stays fast and no test run moves money.

**After:** the assertion is live and reproducible, with a transaction hash
anyone can open on Basescan. The gap that remains is one of wording, recorded
above, not of coverage.

---

## What this eval run did to the database

Nothing that survived it. The harness creates throwaway invoices, and deletes
them with every settlement event, ledger entry and pending row they produced,
pass or fail:

```text
ledger before   12 entries, Σ = 0
ledger after    12 entries, Σ = 0
```

The two `webhook_deliveries` refusal rows from case 2 are deliberately left in
place — they are the evidence for that case.

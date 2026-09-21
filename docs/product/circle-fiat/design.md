# Design — Fiat rail (Circle sandbox)

Date: 2026-09-15 · From: `docs/product/circle-fiat/discovery.md` · Cycle 2 · FULL track
**Amended 2026-09-18** — three fixes added during Develop, and one open
decision recorded rather than defaulted. See "Scope added during Develop" at
the end; this design describes what was actually built.

---

## Step 1.0 — Existing-implementation verdict

**Verdict: ENHANCE**, with **one FIX named separately** (FIX 1) and **one
Discovery claim corrected downward** (FIX 2, below — it is smaller than
Discovery said, and the design says so rather than manufacturing the work).

### Current behaviour, in six lines

A deal's settlement rail is a column on the invoice (`invoices.rail`,
`src/db/schema.ts:112`), resolved to an implementation by `railFor()`
(`src/lib/rails/index.ts:14-20`). Ops presses a money gate, a `ConfirmDialog`
shows the exact ledger entries and posts only the invoice id
(`src/components/ui/confirm-dialog.tsx:12-17`), and `settleThroughRail`
(`src/lib/deals/actions.ts:38-70`) runs `execute → verify → bookMovement` in
one function call, then compare-and-swaps the invoice status. `bookMovement`
is the sole writer of `settlement_events` and `ledger_entries`
(`src/lib/ledger/index.ts:74-113`); balances are derived by `SUM` and stored
nowhere (`:117-140`). Two rails exist: `demo-internal` and `usdc`
(`src/lib/rails/types.ts:16`).

### Why ENHANCE, with evidence

The seam was built for a third rail and says so. `railFor`'s header: adding a
rail "means adding a line here and nothing else"
(`src/lib/rails/index.ts:1-3`). `evidence_kind` already contains
`'circle-payment-id'` and `'statement-line'`, declared in cycle 0 "so cycles
1–3 add rows, not columns" (`src/db/schema.ts:70-77`).
`MovementInput.type` "follows the schema enum — new leg types need no edit
here" (`src/lib/ledger/index.ts:28-29`). `VerifiedTransfer.explorerUrl` is
optional, "absent for off-chain rails" (`src/lib/rails/types.ts:57-58`).
`RailActor` maps to "a wallet, later a bank account or a Circle wallet id"
(`:19-21`). And `TransferPreview.note` already exists for "anything the
person should know before confirming (fees, **timing**)" (`:40-41`) — the
field an asynchronous rail needs, written a cycle before it was needed.

**What is not ENHANCE: the sequencing.** `settleThroughRail` awaits `verify`
inline (`src/lib/deals/actions.ts:59-60`). Circle answers `pending`. The
seam's four moves survive intact; the assumption that they complete in one
request does not.

### FIX 1 — an executed-but-unbooked movement has no record (live defect)

`settleThroughRail` calls `execute` at line 59 and `verify` at line 60. If
`execute` broadcasts and `verify` throws — or the process dies between them —
**the money has moved and nothing in this system records that it did.** No
settlement event (the ledger refuses unverified movements, correctly), no
pending row (none exists), nothing.

This is not hypothetical. Cycle 1 hit it: `docs/product/settlement-usdc/develop.md:79-87`
records the RPC read-after-write lag that made `verify` refuse a legitimate
disbursement, and the response was a retry loop in `src/lib/rails/usdc.ts` —
a patch on the symptom. The cause is that there is no durable record of
intent between `execute` and the booking.

**The repair, named as its own work:** a `pending_settlements` row is written
**before** `execute`, not after. It is the intent record. Every outcome —
settled, still pending, failed, crashed — then has somewhere to live. This
repairs the USDC rail as much as it enables the Circle one, and it is
built and tested as a rail-neutral piece (build step A2), not smuggled inside
the Circle work.

**Added 2026-09-15 from cycle 1's deploy audit (D-1/D2), and it belongs to
FIX 1 rather than to a message tidy-up.** `src/lib/rails/usdc.ts:142` refuses
an unconfirmed transfer with *"Nothing has been booked — use Check status to
verify it again."* **No such control exists** — searched all of `src` and
`scripts`, and the only occurrence of "Check status" in the repository is
that message. So today, in the one case where a transfer is broadcast but
unconfirmed, the operator is directed at a button that was never built.

A1's pending record is exactly what a working Check-status needs, and A2's
`completeSettlement()` is the re-verify it would call. So A2 additionally
delivers: a **Check status** control on any leg with an open pending row,
calling the same `completeSettlement` the webhook calls, on both rails. The
message stops being a promise and becomes a description. Covered by eval 5(b),
which already asserts the pending row survives a verify-time failure on the
USDC rail — extended to assert the control settles it.

### FIX 2 — corrected: the ledger already segregates more than Discovery claimed

Discovery §7 asserted that `platform_treasury` "carries both roles" and that
splitting it was cycle-2 scope. **Reading `src/lib/deals/preview.ts` this
session shows that is wrong**, and the design corrects it rather than
inheriting it:

- Funding: `funder_cash −P · treasury +P` (`preview.ts:27-35`) — client money in.
- Disbursement: `treasury −P · supplier_payable +D · fee_income +fees` (`:130-144`) — the platform's fee **leaves** the conduit immediately.
- Repayment: `debtor_cash −face · treasury +face` (`:59-64`) — client money in.
- Payout: `treasury −(P+overdueFunder) · fee_income −funderInterest · funder_cash +total` (`:73-93`).
- Residual: `treasury −(…) · supplier_payable +(…) · fee_income +platformShare` (`:101-123`).

`platform_treasury` is **already a pure client-money conduit**; `fee_income`
is already the platform's own. They have never shared an account. What is
genuinely wrong is **naming and enforcement**, not balances:

1. The account is called `platform_treasury` — a name that says the opposite
   of what it holds, and the name is what a reviewer reads.
2. Nothing in code declares which account kinds are client money and which
   are the platform's own, so nothing can assert the separation or display it.
3. There is one shared conduit whose balance can, arithmetically, go negative
   — meaning the platform paid out client money it did not hold. Nothing
   forbids it.

**So FIX 2 is scoped to what is actually broken:** rename the kind to
`client_collections` with its meaning written down, declare the two disjoint
sets in code, surface them as two separate subtotals on the ledger page, and
assert the invariant by test. **Not** in scope: a `platform_operating` cash
account splitting `fee_income` into cash and income recognition — that is
accounting depth belonging to cycle 10's custody work, and inventing it here
would be scope inflation dressed as rigour. Chetan approved "split it now"
against Discovery's larger claim; this is the honest version of that
decision, and it is smaller. **Flag for confirmation at Develop Gate 0.5.**

---

## Part 1 — Product design

### 1. Feature statement

Add `circle-fiat` as a third settlement rail so any of a deal's five money
legs can settle in dollars through the Circle sandbox — a rail that confirms
hours later by signed webhook rather than in the request — while the ledger
continues to record only money that has actually moved, and the state machine
remains unable to tell the rails apart.

### 2. Target workflow

**Current (both existing rails), for the diff:**

1. Ops presses a money gate on `/ops/deals/[id]`.
2. `ConfirmDialog` shows the exact entries; ops confirms; the form posts only
   the invoice id (`confirm-dialog.tsx:12-17`).
3. `settleThroughRail` executes, verifies, books, and CAS-updates the invoice
   status — all in the one request (`actions.ts:38-70`).
4. The page re-renders with the leg settled and a Basescan link (USDC) or a
   dashed demo badge (demo-internal).

**Target, for `circle-fiat`:**

1. Ops prices a deal and selects **Fiat · Circle sandbox** on the pricing form.
2. Ops presses a money gate. `prepare()` resolves the destination — the
   counterparty's registered Circle wallet or bank account — and **refuses
   here, before the dialog opens**, if none is registered.
3. The `ConfirmDialog` shows the same exact entries as any other rail, plus
   `TransferPreview.note` carrying the timing sentence — this rail settles
   later (`types.ts:40-41`).
4. Ops confirms. **A `pending_settlements` row is written first**, keyed by
   the same `type:invoiceId` idempotency key the ledger already uses
   (`actions.ts:51`).
5. `execute()` calls Circle; the payment or payout id is stored on the
   pending row.
6. `verify()` re-reads from Circle and returns one of three outcomes:
   **settled** → book now, exactly as today; **pending** → leave the row in
   flight, book nothing; **failed** → mark the row failed, book nothing.
7. The leg renders **in flight**: amber, hollow, dashed — the treatment cycle
   0 defined for "initiated-not-settled" and has never used
   (`design-kit/DESIGN_SYSTEM_NOTES.md:45-53`). The invoice status does not move.
8. Minutes or hours later Circle POSTs to `/api/webhooks/circle`. The
   signature is verified **before the body is parsed for meaning**. An
   unverified delivery is recorded as refused and goes no further.
9. The handler resolves the pending row by the rail's reference, and **calls
   the same `completeSettlement()` the synchronous path calls** — which
   re-reads the payment from Circle's API and takes the same three outcomes.
   The webhook body is a doorbell, never evidence.
10. On **settled**: the movement books, the pending row closes, the invoice
    status CAS-advances. Unattended, by Chetan's decision (§8).
11. On **failed**: nothing books, the leg un-flights carrying Circle's own
    reason, and ops can re-initiate it through the same gate.
12. A deal may have one leg in flight while earlier legs are settled; legs on
    different rails coexist on one deal, as they already do.

**Hybrid mode is no longer in this cycle. Removed 2026-09-15, and the reason
corrects an error in this file's first draft.** It originally read: *"one leg
becomes two chained deferred operations… No new machinery; one new
orchestration rule."* That was wrong. Hybrid is the funder paying in USDC and
the supplier receiving fiat — **two legs on two different rails inside one
deal** — while `invoices.rail` is a single column per deal
(`src/db/schema.ts:112`). It cannot be expressed at all, orchestration rule
or not.

Chetan's question while reviewing this cycle's screen mockups — *"why does
pricing have an option for settlement rail?"* — surfaced it, and the
resolution is better than a schema patch: the **programme** (the supplier ×
buyer RPA) carries the settlement arrangement, so hybrid becomes a programme
*type* rather than a per-deal toggle, and per-leg rails need no per-deal
machinery. It lands in cycle 6 with the programme. Rationale in
`docs/product/CYCLES.md`, "The programme". **Cycle 2 is async-only, one
slice.**

### 3. States & transitions

**`src/lib/domain/states.ts` is not modified. That is the design decision,
made verifiable** — it sits on the untouchable list in the integration
contract, so Develop's Gate 0.5 enforces it rather than trusting it.

- The nine invoice statuses and nine transitions stand exactly as they are
  (`states.ts:5-38`). No `funding_pending` and no four siblings.
- **In-flight is a display condition, not a state** — Chetan's decision,
  2026-09-15, following cycle 1's precedent that overdue-ness "is a display
  condition off the due date, not a state" (`PRD.md` §2). Its source of truth
  is the existence of an open `pending_settlements` row for that invoice and
  leg type. Derived, never stored on the invoice.
- **Who moves what:** ops initiates (a person, at the gate). Circle's own
  records decide the outcome. The webhook is a *notification that a decision
  may exist*, never the decision.
- **What is irreversible:** a booked movement. Nothing in this cycle deletes
  or edits a ledger entry — a failed payout books *nothing*, so there is
  nothing to reverse. (General post-settlement reversal, where money did move
  and must be unwound, is cycle 3 — `PRODUCT_PAPER.md` §7.)
- **Pending-row lifecycle**, the only new state machine, and it is local to
  one leg: `initiating → initiated → settled | failed`. `initiating` exists
  solely so a crash between write and `execute` is distinguishable from one
  after it. `settled` and `failed` are terminal; a failed leg is re-initiated
  as a **new row**, so the history of attempts is never overwritten.
- **What the flag hides:** with `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` absent or
  off, the pricing form offers two rails, `railFor("circle-fiat")` refuses
  with a named rule, and the webhook route refuses every delivery. Absent
  means off, never an error.

### 4. Data contract

**Reads:** `invoices`, `parties`, `accounts`, `settlement_events`,
`ledger_entries` (for balances), `wallets` (USDC rail only, unchanged).

**Writes:** `settlement_events` + `ledger_entries` — **only ever through
`bookMovement`** (`src/lib/ledger/index.ts:74`), unchanged; plus the three
new tables below.

**Schema changes — each surfaced, each re-approved before it is written:**

1. **`settlement_rail` enum gains `'circle-fiat'`.** One value.
2. **New table `pending_settlements`** — the in-flight record and FIX 1's
   repair. Columns: `id`, `invoice_id` (FK), `type` (the existing
   `settlement_event_type` enum — no new leg types), `rail`, `status`
   (`initiating|initiated|settled|failed`), `rail_reference` (nullable until
   `execute` returns), `amount_minor` (bigint), `idempotency_key`,
   `failure_reason` (nullable), `initiated_at`, `resolved_at` (nullable).
   **Partial unique index on `idempotency_key` where status is not `failed`**
   — so one leg can never be in flight twice, while a failed attempt does not
   block a retry. It deliberately mirrors `settlement_events_tx_hash_once`
   (`schema.ts:167-172`), which is partial for the same class of reason.
3. **New table `settlement_destinations`** — because `wallets` cannot serve:
   every row there is keyed by `chain_id` not null, in the column and in both
   unique constraints (`schema.ts:177-191`), and a bank account has no chain
   id. Columns: `id`, `party_id` (nullable = the platform's own), `rail`,
   `kind` (`circle-wallet|bank-account`), `external_id`, `label`,
   `is_client_money` (boolean). **No credential ever lands here** — the same
   rule `wallets` states for key material (`schema.ts:175-177`); the Circle
   API key stays in the environment, read at request time.
4. **New table `webhook_deliveries`** — so out-of-order and duplicate
   deliveries are *provable* rather than asserted, and a forged one is
   recorded as refused rather than silently dropped. Columns: `id`,
   `source`, `external_id`, `signature_valid` (boolean), `received_at`,
   `raw_body`, `resolved_pending_id` (nullable), `outcome`.
5. **`account_kind`: `platform_treasury` → `client_collections`** (FIX 2).
   A rename with the meaning written into the enum's comment: money held for
   others, never the platform's.
6. **`evidence_kind = 'circle-payment-id'` gains its own uniqueness guard** —
   a second partial unique index beside the `tx-hash` one, so one Circle
   payment id can never settle two legs. The existing index is partial and
   therefore does not cover it (`schema.ts:167-172`).

Migration `0005`, additive except the enum rename, which is mechanical.

**Fixtures for the prototype** (`scripts/seed.mts`): fiat-rail backdrop deals
covering the states that are otherwise invisible — one leg **in flight**, one
**failed and re-initiable**, one fully settled on the fiat rail — following
cycle 1's pattern of seeding `returned` and `priced` so a state is visible
without staging it. Synthetic parties only; no real company, no real person.
Circle's sandbox key is `SAND_`-prefixed and cannot move real money
(`STACK_RULES.md:182-184`).

**The build's first step, not its middle:** the sandbox holds no balance and
no registered wire account (`STACK_RULES.md:203-205`). Funding it and
registering a test bank account is build step A0, and its result — including
the exact mock-deposit route Circle publishes for simulating an inbound wire
— is recorded in `STACK_RULES.md` and `docs/circle-sandbox-runbook.md`
rather than assumed here.

### 5. Screens & components

Every choice is a strict subset of the host vocabulary, per the rule in
`design-kit/DESIGN_SYSTEM_NOTES.md:103-109`.

- **`src/components/pricing-form.tsx:72-84`** — the rail select gains a third
  option, "Fiat · Circle sandbox", and its explanatory sentence gains the
  timing fact. Existing pattern, one more option.
- **`/ops/deals/[id]`, stage 3 (`page.tsx:318-430`)** — a leg with an open
  pending row renders an **in-flight strip** instead of its action button:
  the amount, the Circle reference, when it was initiated, how long it has
  been in flight, and the sentence that nothing has booked. Colour is
  `--flight #B45309`, **hollow and dashed** — the treatment cycle 0 reserved
  for "initiated-not-settled" and which `DESIGN_SYSTEM_NOTES.md:51-53`
  records as "nearly idle… pending transactions are its intended tenant". No
  new colour is invented; the reserved one finally gets its tenant.
- **`src/components/ui/provenance-badge.tsx`** — a third treatment, and it
  carries the product's own argument. Cycle 1 established two: dashed-muted
  (a stand-in for proof) and solid-cobalt with an `href` (it *is* the proof,
  openable on Basescan — `DESIGN_SYSTEM_NOTES.md:96-98`). A Circle payment id
  is neither: it is **real evidence that you cannot check yourself**, because
  it lives in Circle's database. It renders solid, with no link, and says so.
  That distinction is not decoration — it is the dimension cycle 4's priced
  rail comparison will compare, surfacing a cycle early.
- **`/ops/ledger`** — a new **In flight** panel above the derived balances,
  listing initiated-not-settled legs with the stamp that they are **excluded
  from every balance below**. The balances panel splits into two subtotals —
  **Client money held** and **Platform funds** — from the account-kind
  classification (FIX 2), each keeping the existing "= SUM(entries) ·
  derived, never stored" stamp (`DESIGN_SYSTEM_NOTES.md:85-86`).
- **`/ops` queue** — deals with an in-flight leg carry the same amber hollow
  marker, so ops sees what is waiting without opening each deal.
- **Supplier and funder pages** — unchanged in structure; a disbursement or
  payout in flight shows the in-flight strip rather than appearing as
  received. Money that has not arrived must never look like money that has.
- **`/pay/[invoiceId]`** — on a fiat-rail deal the debtor is shown wire
  instructions and a reference, then the page reports the payment as awaited.
  Public, no seat, unchanged in that respect.

**Vocabulary additions declared now, folded into
`DESIGN_SYSTEM_NOTES.md` at cycle close** (per the seam rule at
`:103-109`): (a) the in-flight strip; (b) the third provenance treatment —
evidence that is real but not independently checkable.

### 6. Permissions

- **Ops screens** — unchanged: `seatGate("ops")` runs first, before any
  query, per `src/lib/roles/gate.tsx`; layouts must not gate (cycle 0, A4).
  An ungranted seat sees the role-gate card and, provably, no data in the RSC
  payload.
- **`/pay/[invoiceId]`** — unchanged: public, no seat, as an invoice payment
  link is.
- **`/api/webhooks/circle` — the new surface, and it has no seat at all.**
  `getIdentity()` is never called in it; there is no session, no cookie, no
  role. **Its only credential is the signature.** This is stated explicitly
  because it inverts the app's model: every other write path begins with a
  person clicking something (`discovery-kit/YOUR_PRODUCT.md:67-68` records
  that `find src -name "route.ts"` returns 0 — "none by design"). The route
  must therefore fail closed on: a missing signature, an invalid signature, a
  malformed body, or the feature flag being off.
- **The flag is checked server-side, not only in the browser.**
  `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` is public by name so the pricing form can
  hide the option, but the rail registry and the webhook route read it on the
  server too. A public flag is never a permission.

### 7. Error & edge handling

| Situation | Behaviour |
|---|---|
| Counterparty has no registered destination | `prepare()` refuses **before the dialog opens**, naming the party and what is missing. Never discovered at `execute`. |
| Circle unreachable at `execute` | The pending row is already written; it is marked `failed` with the transport reason. Nothing books. Ops re-initiates through the same gate. |
| `execute` succeeds, `verify` throws or the process dies | **FIX 1.** The pending row survives as `initiating`/`initiated` with its reference. The webhook, or a re-check from the deal page, resolves it. Money is never moved without a record again. |
| Circle settles a different amount | `verify` returns a mismatch refusal; nothing books; surfaced as an exception naming cycle 3, exactly as cycle 1 refuses wrong-amount repayments (`docs/product/settlement-usdc/develop.md:91-93`). |
| Webhook signature invalid or absent | Refused, recorded in `webhook_deliveries` with `signature_valid = false`, nothing parsed for meaning, nothing booked. |
| Same webhook delivered twice | Both call `completeSettlement`; the second's booking hits the ledger's unique idempotency key and returns `ledger-already-recorded` (`src/lib/ledger/index.ts:101-107`), which is treated as success. One booking. |
| Webhooks out of order | **Designed out rather than handled.** No delivery is ever trusted for its status — every one triggers a fresh read of Circle's own record. Order cannot matter to a path that never reads the body's claim. |
| Webhook for an unknown reference | Recorded as `unmatched` and acknowledged with 2xx, so Circle stops retrying. This is the first real instance of cycle 3's unmatched-reference exception, and it is left as a record for that cycle rather than half-solved here. |
| Double initiation of one leg | The pending row's partial unique index refuses it — the same class of guard as the ledger's, in the database rather than the UI. |
| Flag off, webhook arrives | Refused and recorded. |
| In-flight money and balances | Pending rows are in their own table with no `event_id`; `balances()` sums `ledger_entries` only (`src/lib/ledger/index.ts:132-140`). In-flight money cannot reach a balance **by construction, not by filter** — which is the whole reason the pending row is not a status column on `settlement_events`. |

### 8. Human gates

**The existing gate is unchanged and unweakened.** Every money movement still
opens a `ConfirmDialog` that shows the exact entries computed on the server,
and the form posts only the invoice id so "what is displayed can never be
what is trusted" (`src/components/ui/confirm-dialog.tsx:12-17`). This cycle
adds one line inside that dialog — the timing sentence, carried by
`TransferPreview.note`, a field that already exists for it
(`src/lib/rails/types.ts:40-41`).

**The webhook books without a gate. Chetan's decision, 2026-09-15**, recorded
with its reason: ops authorised the movement when they pressed the gate; the
webhook only reports what Circle did with money already authorised, and no
bank waits for an operator before settling. Parking every completion for a
human would make the ledger lag reality by hours and would misrepresent
settlement. The alternatives (queue-for-confirmation; auto-book successes but
gate failures) were considered and rejected.

**What has no gate because it has no consequence:** reading, re-checking a
pending leg's status against Circle, and recording a refused delivery.

**What must never happen, restated from Discovery §8 so the build can be held
to it:** never initiate a payment no person authorised · never treat the
webhook body as evidence · never book an unverified delivery · never book one
leg twice · never silently repair an amount mismatch · never show in-flight
money as settled or inside a balance · never touch mainnet, production, or
real money.

---

## Part 2 — The agent question (default no)

**Step needing judgment:** none. Conceded, and the concession is the finding.

**Walking the workflow for a candidate.** Step 2 (resolve a destination) is a
lookup. Step 6 (three outcomes from Circle's record) is a mapping of a value
Circle returns. Step 8 (signature) is cryptography — a model would make it
*worse*, since "probably authentic" is not a security posture. Step 9
(matching a delivery to a pending leg) is a key lookup. Step 11 (surface a
failure reason) is passing through text Circle wrote.

**What it would read that product logic cannot evaluate:** nothing. Every
input on this path is a value from Circle's API, a row, or a signature.
There is no document, no free text requiring interpretation, no rule pack to
weigh. This is the cleanest "no" the method has produced in this project.

**Cost per run vs value per case:** at the origin project's ~11¢/call
precedent, adding a model to a webhook handler would cost roughly 11¢ per
delivery — and deliveries are machine-generated, duplicated and retried. It
would be the only cost centre in a cycle that otherwise costs nothing to run,
and it would buy no judgment.

**Failure mode, and whether Part 1's gate contains it:** the failure mode
would be a model hallucinating a settlement that did not happen. Part 1's
gate does **not** contain it, because the webhook path is deliberately
ungated (§8) — which is precisely why nothing probabilistic may sit on it.
The safety of the ungated path depends on it being deterministic.

**Verdict: NO AGENT.** The feature ships as Part 1 alone. The first place in
this product where the question is genuinely open is cycle 3's *ambiguous
match* exception, where an unmatched payment must be reasoned about against
several candidate invoices — and even there the burden stays on the agent.

---

## Part 3 — Agent blueprint

Not run. Part 2 returned no agent.

## Build order

The template records a build order only when Part 3 ran, which it did not.
One sequencing decision still needs recording, because it was taken with
Chetan at Discovery and it bounds the cycle:

**One slice — the fiat rail with asynchronous settlement.** It delivers
all-fiat mode and is what cycles 3 and 4 depend on.

**The conditional second slice was removed on 2026-09-15** (Chetan). Hybrid
cannot be built on a per-deal rail column, and the programme is where it
belongs — cycle 6. Discovery's framing of hybrid as "conditional on the
sandbox supporting the conversion" was the wrong question: the blocker is not
Circle's capability, it is this repo's data model, and the fix is a design
change rather than a sandbox probe.

**Build steps**, in dependency order: **A0** sandbox setup and
capability record → **A1** schema 0005 + the account-kind rename (FIX 2) →
**A2** the pending-settlement record and `completeSettlement`, rail-neutral,
with the USDC rail migrated onto it (FIX 1, proved by test before Circle
exists) → **A3** the seam's three-outcome `verify` and the two existing rails
conformed → **A4** the Circle client, rail and verifier → **A5** the webhook
route, signature verification and the signed replay script → **A6** screens.

FIX 1 lands at A2, **before** any Circle code, so it is verifiable as a
repair to the existing rails rather than as a side-effect of the new one.

---

## Integration contract

**Classification: ENHANCE.** The allow-list is the centrepiece; anything not
named here is a stop-and-ask in Develop.

**Branch:** `feat/circle-fiat`, cut from `feat/settlement-usdc`.
**Flag:** `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` — absent means off, never an
error; checked on the server as well as in the browser.

### New files (additive)

```text
src/lib/settlement/pending.ts          the in-flight record + completeSettlement —
                                       THE single booking path both the request
                                       and the webhook use. Rail-neutral (FIX 1).
src/lib/settlement/pending.test.ts
src/lib/rails/circle.ts                the rail: prepare · execute · verify
src/lib/rails/circle-client.ts         HTTP against Circle; framework-free by the
                                       same rule as the rest of src/lib/rails
src/lib/rails/verify-circle.ts         re-reads Circle's own record; mirrors
                                       verify-usdc.ts, including its refusals
src/lib/rails/circle.test.ts
src/lib/rails/verify-circle.test.ts
src/lib/webhooks/circle-signature.ts   fail-closed verification
src/lib/webhooks/circle-signature.test.ts
src/app/api/webhooks/circle/route.ts   the app's FIRST route handler
src/components/in-flight-strip.tsx
scripts/replay-circle-webhook.mts      mints a correctly-signed delivery against
                                       localhost (Chetan's choice, 2026-09-15)
drizzle/0005_*.sql
docs/circle-sandbox-runbook.md         mirrors docs/demo-wallets-runbook.md
src/features/circle-fiat/MANIFEST.md   the allow-list as an enforceable file
```

### Allow-list — existing files, each with its reason

```text
src/lib/rails/types.ts          RailId gains 'circle-fiat'; verify() returns the
                                settled|pending|failed union; rails declare
                                settlement: "immediate" | "deferred"
src/lib/rails/index.ts          one registry line, as its own header promises
src/lib/rails/demo-internal.ts  conform to the new verify return (always settled)
src/lib/rails/usdc.ts           conform; the RPC-lag retry becomes an honest
                                "pending" outcome instead of a blind retry
src/lib/rails/verify-usdc.ts    same conformance; no refusal rule is relaxed
src/lib/deals/actions.ts        settleThroughRail writes the pending row before
                                execute and delegates booking to completeSettlement;
                                plus the Check-status action (A2) that re-verifies
                                an open pending leg on either rail — the control
                                usdc.ts:142 has been promising since cycle 1
src/lib/deals/preview.ts        account-interface rename treasury →
                                clientCollections (FIX 2); NO entry shape changes
src/lib/queries.ts              read open pending rows for the deal page, queue,
                                ledger, supplier and funder — the host's shared
                                query module (PATH CORRECTED at Gate 0.5: the
                                design said src/lib/deals/queries.ts, which does
                                not exist; cycle 1 used this same file)
src/db/schema.ts                the three new tables, two enum values, the rename,
                                the circle-payment-id uniqueness guard
src/lib/ledger/index.ts         ONE addition only: the exported declaration of
                                which account kinds are client money vs platform
                                funds, for the two ledger subtotals. No change to
                                validateEntries, bookMovement or the balance
                                derivation — this file is the sole ledger writer
                                and STACK_RULES makes any change here a decision.
src/app/ops/deals/[id]/page.tsx the in-flight strip in stage 3, carrying the
                                Check-status control for an open pending leg
src/app/ops/page.tsx            in-flight marker on the queue
src/app/ops/ledger/page.tsx     the In flight panel + two subtotals
src/app/pay/[invoiceId]/page.tsx wire instructions + awaited state on fiat deals
src/app/supplier/page.tsx       in-flight disbursement/residual, not "received"
src/app/funder/page.tsx         in-flight payout, not "received"
src/components/pricing-form.tsx third rail option + its timing sentence
src/components/ui/provenance-badge.tsx  third treatment: real but not
                                independently checkable
scripts/seed.mts                fiat backdrop deals incl. in-flight and failed
.env.example                    the Circle webhook variables finalised at A0
```

### Documentation updated at cycle close, not during

```text
design-kit/DESIGN_SYSTEM_NOTES.md   the two declared vocabulary additions
discovery-kit/YOUR_PRODUCT.md       counts + the async reality
STACK_RULES.md                      the A0 capability record
PRD.md · PRODUCT_PAPER.md           async settlement; the corrected FIX 2 scope
docs/product/CYCLES.md              already updated 2026-09-15 — "The programme"
                                    note; rows 2, 3 and 6 revised
```

### Untouchable

```text
src/lib/domain/states.ts   THE contract line of this cycle. In-flight is a
                           display condition, and this file staying byte-identical
                           is how that claim is verified rather than asserted.
src/lib/money/             rounding and the money boundary; no reason to touch
src/lib/pricing/*          no pricing change this cycle; the overdue model stands
src/lib/roles/*            no auth change; the webhook has no seat by design
src/lib/rails/wallets.ts   chain-keyed and correct; destinations get their own home
vercel.json · drizzle/0000–0004 · every component not named above
```

**Secrets posture, unchanged and restated:** `CIRCLE_API_KEY` and the webhook
credential are server-side, read at request time, never `NEXT_PUBLIC_`,
**never added to any Vercel scope during Develop**, never echoed. Circle's
signature scheme is read from their documentation at A0 and recorded — if it
is an ECDSA public key rather than a shared secret, `CIRCLE_WEBHOOK_SECRET`
becomes a public-key variable in `.env.example`. That is a naming change, not
a structural one, and the design does not guess it.

---

## Eval plan

1. **Happy path — a fiat deal settles asynchronously, end to end.** All legs
   initiated on `circle-fiat`, each visibly in flight, each settled by a
   signed webhook; distinct Circle references per leg; every movement's
   entries sum to zero; the pinned overdue example still reproduces to the
   cent (22.22 / 20.00 / 2.22). *Checkable: five settled legs, five distinct
   references, invoice reaches `settled`.*

2. **Edge — a forged delivery is refused.** A body with an invalid signature,
   and one with no signature, are both refused before being parsed for
   meaning, recorded in `webhook_deliveries` with `signature_valid = false`,
   and book nothing. *Checkable: the ledger is byte-identical before and
   after; two refusal rows exist.*

3. **Edge — duplicate and out-of-order delivery converge.** The same
   completion delivered three times books once (the second and third hitting
   `ledger-already-recorded`); and a `complete` delivered *before* its
   `pending` sibling produces a ledger identical to the in-order run.
   *Checkable: one settlement event; two orderings compared row for row.*

4. **Edge — Circle reports failure.** A payout Circle ultimately fails books
   nothing, un-flights the leg with Circle's own reason on screen, leaves the
   deal re-initiable, and the re-initiation creates a **new** pending row
   rather than overwriting the failed one. *Checkable: zero ledger entries;
   two pending rows; the deal completes on the retry.*

5. **Boundary — in-flight money is never money, and an executed movement is
   never silent.** Two halves of one limit. (a) `balances()` returns exactly
   the same map before an initiation and while the leg is in flight, and
   changes only when the webhook books. (b) **FIX 1 proved:** a settlement
   whose `verify` throws after a successful `execute` leaves a durable
   pending row carrying the rail's reference — asserted against the **USDC**
   rail as well as Circle, since that is where the defect lives today.
   *Checkable: map equality; a pending row present after an induced
   verify-time failure on both rails.*

---

## Build-readiness gate

- **Job in one sentence:** yes — Part 1 §1.
- **Every fact traced to a named file or table:** yes. Notably, Discovery's
  FIX 2 claim was checked against `src/lib/deals/preview.ts` this session and
  **corrected downward** rather than inherited.
- **Missing-data behaviour known:** yes — §7, twelve rows, including the
  unregistered destination refusing at `prepare` before the dialog opens.
- **Human gate before every consequence:** yes. The existing `ConfirmDialog`
  is unchanged and unweakened; the one ungated path (webhook booking) is
  Chetan's recorded decision with its reason, and Part 2's "no agent" verdict
  exists partly to keep that path deterministic.
- **One eval case tests the limit:** yes — eval 5, both halves.
- **Contract names every existing file to be touched:** yes — 21 allow-listed
  files with reasons, plus an explicit untouchable list headed by
  `src/lib/domain/states.ts`, whose byte-identity is the cycle's central
  claim made verifiable.
- **If Part 3 ran:** it did not. The cycle is one slice; the conditional
  hybrid slice was removed 2026-09-15 and is recorded under Build order.

**Two items carried to Develop Gate 0.5 for Chetan's confirmation:**

1. **FIX 2's corrected scope.** He approved "split it now" against
   Discovery's larger claim that the treasury commingles. It does not — the
   ledger already separates client money from platform funds. The repair is a
   rename, a declared classification, two ledger subtotals and an invariant
   test; a `platform_operating` cash account is explicitly *not* in scope and
   is left to cycle 10.
2. **Circle's inbound-payment capability.** Two of the five legs are money
   coming *in* (funding, repayment). Whether the sandbox can simulate an
   inbound wire — and by which route — is determined at A0 and recorded in
   `STACK_RULES.md`. If it cannot, that is a scope conversation before A1,
   not an improvisation during A4.


---

## Scope added during Develop (2026-09-18)

Three defects found by **using** the product during case 1's walkthrough, none
of them declared at design time, all repaired on this branch. They are
recorded here rather than absorbed into the build, because a design that does
not describe what was built stops being a design.

Two of the three predate this cycle. Asynchrony did not cause them; it caused
somebody to look closely at a payout and a pricing form.

### FIX 3 — discounting, not lending

The pricing screen has rendered "Funder pays in — principal less their return"
since cycle 0. The funding gate moved the full principal and repaid principal
plus interest at payout. Two conventions for one deal: the screen described
discounting, the ledger performed lending. The return and the platform margin
were identical either way, so nothing was mispriced — but the screen was the
half telling the truth about the product.

**Decided (Chetan): discounting.** The funder pays in principal less their
return and is repaid the principal; only the overdue share is added at payout,
because extra days cannot be discounted up front. No pricing arithmetic
changed — `funderFinancingMinor` was already computed and already displayed.

It makes §4's segregation claim stronger, and the test now asserts the stronger
form: **client money after funding and disbursement is exactly zero.** Cycle 1
swept the whole principal and parked the return in `fee_income`; FIX 2 held it
as client money; neither is needed if the return never arrives.

### FIX 4 — the money boundary

`src/lib/money/` is on the untouchable list. Chetan lifted it for this.

`.1` was refused — a leading point is an ordinary way to write ten cents.
Worse, and unreported because nothing complained: every comma was stripped as
a thousands separator, so a **decimal comma silently multiplied an amount by
ten**. A comma is now a separator only when it groups three digits properly;
anything else is a named refusal. Thousands are untouched.

Alongside it: React 19 resets an uncontrolled form once its action returns,
*including on a refusal* — so a rejected fee reset the settlement rail to
`demo-internal`, and the natural next move is to fix the typo and resubmit on
the wrong rail. The pricing form is controlled now.

### FIX 5 — an inbound payment could be matched to another deal's deposit

The one that lost money. A repayment was matched to a deposit that had settled
a different invoice an hour earlier; the ledger's uniqueness guard refused the
booking, correctly; the refusal was read as "this leg is already done"; the leg
was marked settled and nothing booked.

Two causes, both repaired:

- **The inbound window ran from `now`**, so it reached backwards past the leg's
  own beginning and grew the longer you waited. `TransferRequest` gains
  `initiatedAt`, resolved by the caller from the pending row. This is an
  addition to the seam's own contract and is therefore design, not repair: a
  rail that recognises money by *arrival* must be told when the leg began.
- **`ledger-already-recorded` was read as "settled" without checking whose
  movement existed.** It now means settled only when a movement for *this* leg
  is present; evidence owned by another leg is a named reconciliation
  exception pointing at cycle 3.

This is §7's error handling extended by a case §7 did not imagine: not a rail
failing, but a rail answering about somebody else's money.

## Open decisions, recorded rather than defaulted

**1 · The eval plan's case 5(b) wording. DECIDED 2026-09-21 (Chetan): amend.**
The case now reads "a durable row" — see §Eval plan, case 5. The PARTIAL grade
in `evals.md` STANDS as the record of the run that found the drift; amending
the case does not retroactively re-grade the evidence, and a file that read
4/5 pass with no trace of the disagreement would be worth less.

**2 · Which moment is the repayment date. DECIDED 2026-09-21 (Chetan): the
date the PLATFORM RECEIVES the money** — which is what the ledger already
records, so the current behaviour is correct and this stops being an open
question. The reasoning that makes it defensible: the platform can only
evidence what it actually received, and a claimed send date is the debtor's
assertion rather than a fact this system can verify.

**The consequence is recorded rather than hidden**, because it falls on a
party who did nothing wrong: a debtor who pays on time through a bank that
takes three days is recorded as three days late, and the overdue interest for
those days is borne by the SUPPLIER'S residual (cycle 1's rule). The supplier
pays for the rail being slow. That is a defensible position for a platform
that settles in minutes and an uncomfortable one for a platform settling by
wire — so cycle 3, which builds reconciliation, should revisit whether a
value date supplied by the debtor's bank can be captured and trusted.

**3 · Deferrals to cycle 3, CONFIRMED 2026-09-21 (Chetan).** The inbound
amount-and-window matching collision, the unreconciled deposit `99bea655`, the
page that never learns money moved, and the value-date question above all land
in cycle 3's reconciliation scope rather than being patched here.

**4 · A confirmation step between pricing and funding.** Chetan's feedback
during case 1: pricing applies immediately and Fund becomes available at once;
there should be an explicit "these terms are correct" gate first. Not built,
deliberately — a real gate needs a state, and `src/lib/domain/states.ts`
staying byte-identical is this cycle's verified central claim; a client-side
confirmation would be a courtesy dressed as a control. Lands naturally at
cycle 6, where pricing becomes read-only and the signed grid applies.

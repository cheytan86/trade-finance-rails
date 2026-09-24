# Design — Reconciliation ops (matching inbound payments)

Date: 2026-09-21 · From: `docs/product/reconciliation-ops/discovery.md`

Cycle 3. Cycle 2's R0 recorded **NO-GO on the fiat rail until cycle 3 is
finished**, naming *"there is no control to match a payment by hand"* as its
first reason (`docs/product/circle-fiat/release.md`). This design unblocks that
release.

> **Baseline note.** Every count in this file — *13 deposits · 10 attributed ·
> 3 unattributed · $50,105.00* — is **as at 2026-09-21**. The VAN test on
> 2026-09-22 (Epic F) deliberately added two deposits, 13.57 and 24.68, so the
> live figures are now **15 deposits · 10 attributed · 5 unattributed ·
> $50,143.25**. The two test deposits are genuine unattributed payments and are
> legitimate eval fixtures — they are money that arrived for no deal, which is
> exactly case 4. Restate the baseline at Develop's Gate 0 rather than trusting
> either number here.

---

## Step 1.0 — Existing-implementation verdict

**Verdict: ENHANCE, plus two FIXes named as their own work.**

### Evidence — what exists today

```text
the sole writer       src/lib/ledger/index.ts — bookMovement, validateEntries;
                      balances derived by SUM at read, never stored
in-flight record      pending_settlements — initiating · initiated · settled ·
                      failed, with failure_reason      src/db/schema.ts:254,304
the orchestrator      completeSettlement                src/lib/settlement/pending.ts:196+
the rail seam         prepare / execute / verify        src/lib/rails/types.ts:118-122
inbound matching      matchInboundDeposit               src/lib/rails/verify-circle.ts:82
the display           in-flight-strip.tsx — the cycle-2 --flight pattern,
                      already renders a failed leg with its reason
ops surfaces          /ops · /ops/ledger · /ops/deals/[id] — three routes.
                      NONE of them lists money received.
accounts              account_kind: funder_cash · client_collections ·
                      supplier_payable · fee_income (retired) · debtor_cash ·
                      platform_operating                src/db/schema.ts:72
                      grep -i unapplied across src/ and drizzle/ → ZERO hits
parties               id · name · role · createdAt — no bank-account
                      identifiers of any kind           src/db/schema.ts:113
the half-register     settlement_destinations: partyId + rail → externalId,
                      with unique(partyId, rail)        src/db/schema.ts:334,349
seats                 supplier · ops · funder · debtor  src/lib/roles/parse.ts:6
migrations            0000–0006
```

### Current behaviour, in five lines — what everything below diffs against

Inbound matching is **pull-based and per-leg**. `matchInboundDeposit` runs only
because one specific pending leg asked "has *my* money arrived?", filtering the
rail's deposit list to an exact amount within a window opening when that leg was
initiated. Exactly one match settles the leg; no match returns `pending`; two or
more **throw**. Every deposit that is not the one being looked for is discarded
in memory — the full list is already fetched on every status check
(`src/lib/rails/circle.ts:154`) and thrown away. Nothing anywhere records that a
payment arrived.

The consequence, measured: **four of the five exceptions this cycle handles are
not unhandled, they are invisible.** A part payment does not match an exact
amount. A payment that landed before the leg opened is filtered out by the
window. A payment for no open deal matches nothing.

### FIX A — part payment is structurally impossible

```ts
/** The key both guards share: one leg, one movement, one in-flight row. */
export function idempotencyKeyFor(type: LegType, invoiceId: string): string {
  return `${type}:${invoiceId}`;
}
```

`src/lib/settlement/pending.ts:97-100`, and `settlement_events.idempotency_key`
is `.unique()`. A part payment is one leg receiving two movements. **Postgres
forbids it.** Eval case 2 cannot pass against the current schema — not for want
of a feature, but because a uniqueness guard prohibits it.

The guard is what stops a double-click booking twice. It is **replaced, not
removed**, and the replacement is money-critical.

### FIX B — an ambiguity permanently kills a legitimate leg

`matchInboundDeposit` throws `rail-ambiguous-match` when two deposits of the
same amount sit in the window (`src/lib/rails/verify-circle.ts:105`). The throw
is correct — guessing is how the wrong money gets booked. What happens next is
not: `completeSettlement` catches **every** throw as a mismatch and calls
`markFailed` (`src/lib/settlement/pending.ts:242-249`), and `failed` is terminal
(`src/db/schema.ts:255`).

Nothing failed. The money arrived, twice over; one of those deposits belongs to
this leg. The product discovered *that it does not yet know* and recorded
*failure*. Worse, a retry opens a new leg whose window starts now, so both
deposits fall outside it and the money becomes matchable by nothing. **This is
how `99bea655` was orphaned.**

### Correction to the discovery file, applied 2026-09-21

Discovery row 4 said the ambiguous exception survives *"only in a log line."*
Wrong — it is written to `pending_settlements.failure_reason` and rendered on the
deal page (`src/components/in-flight-strip.tsx:44`). The real gap is narrower and
better: **it is recorded against the deal**, findable only by someone who already
knows which deal to open, and money belonging to no deal has no page at all.

---

## Part 1 — Product design

### 1. Feature statement

**Ops attributes inbound payments to open settlement legs — in full or in part —
from a queue listing every payment the rail has received, with every attribution
confirmed by a person on screen and booked through the existing ledger writer.**

The limits are in the sentence deliberately: *ops* (not four seats), *inbound*
(not outbound), *attribute* (never amend, never return), *confirmed by a person*
(no automatic booking).

### 2. Target workflow

| # | Today | Target |
|---|---|---|
| 1 | Nothing. No screen shows money received. | Ops opens `/ops/payments` and sees every payment the rail holds. |
| 2 | — | Each row: amount · arrival time · sender · still unattributed · **age**. |
| 3 | The leg's Check status guesses from amount + window. | Ops opens a payment and sees candidate legs with each one's outstanding amount. |
| 4 | Exact amount only; anything else is invisible. | Ops attributes it — all of it, or part of it. |
| 5 | Ambiguity fails the leg terminally (FIX B). | Both candidates shown, neither ranked; ops picks, or parks it with a note. |
| 6 | `bookMovement` via `completeSettlement`. | `bookMovement` — the same writer — behind a ConfirmDialog. |
| 7 | `advanceFromBookedLegs` moves the deal. | **Unchanged.** The deal advances from booked legs exactly as now. |
| 8 | — | What ops did, and why, is recorded on the payment. |

### 3. States & transitions

**A payment's attribution state is DERIVED, never stored.**

```text
attributed   = SUM(movements whose evidence_ref = this payment id)
outstanding  = payment amount − attributed
state        = unattributed · part-attributed · fully attributed
```

This follows the house rule rather than inventing one: balances are
`SUM(entries)`, never stored (`src/lib/ledger/index.ts:134`), and
`advanceFromBookedLegs` derives a deal's status from its booked legs rather than
trusting a column. A stored status column would be a fourth place money state
lives, and it would drift from the other three.

| From | To | Who moves it | Reversible |
|---|---|---|---|
| unattributed | part-attributed | ops, in the confirm dialog | **no** |
| part-attributed | fully attributed | ops | **no** |
| unattributed | unattributed **+ owner + note** | ops parks it | yes — a note can be replaced |
| leg `initiated` (ambiguous) | leg `settled` | ops attributing | **no** |
| leg `initiated` (ambiguous) | leg `failed` | **removed by FIX B** | — |

**Existing transitions touched:** exactly one — the ambiguity path from
`initiated` to `failed`, which FIX B removes. **Untouched:** every gate
transition, every webhook transition, `advanceFromBookedLegs`'s forward-only
progression, and `src/lib/domain/states.ts`, which stays byte-identical.

**What the flag hides:** the whole `/ops/payments` route and the payments
indicator on the ops index.

**One transition stated out loud:** a hand-attributed leg does **not** go through
`openPending`. That record exists because money is about to move and might not
arrive (`src/lib/settlement/pending.ts:102-109`); here the money has already
arrived, so there is no in-flight period to record. But where a pending row
already exists — the parked ambiguous leg — attributing must **settle that row
too**, or it stays in flight forever.

### 4. Data contract

**Reads:** `pending_settlements` · `settlement_events` · `ledger_entries` ·
`accounts` · `invoices` · `parties` · `settlement_destinations`
(all in `src/db/schema.ts`), plus the rail's live inbound list.

**Writes:** `settlement_events` and `ledger_entries` — **only** through
`bookMovement` (`src/lib/ledger/index.ts:70`). `pending_settlements` on
resolution of a parked leg. The new payments table.

**Schema changes — each surfaced, none smuggled:**

1. **New `account_kind` value: `unapplied`.** The enum has six values and none
   can hold money that has arrived but is not yet attributed
   (`src/db/schema.ts:72`). `grep -i unapplied` across `src/` and `drizzle/`
   returns zero hits, while `PRODUCT_PAPER.md` names unapplied cash three times
   as an assumed capability. Adding an enum value is additive.
2. **New table `inbound_payments`** — one row per payment, holding **only what
   cannot be derived**: `rail` · `external_id` · `first_seen_at` · `owner_seat`
   · `note` · `resolution_reason`. Aging is impossible without `first_seen_at`:
   the rail's `createDate` is when the bank moved the money, not when we noticed
   it. Amount, date and sender always come from the rail and are never copied
   and trusted. Unique on `(rail, external_id)`.
3. **Idempotency key scheme replaced** (FIX A) — see §7.
4. **`unique(partyId, rail)` on `settlement_destinations` widened**
   (`src/db/schema.ts:349`) — **slice 2 only**. Today a party may have exactly
   one account per rail, so a debtor who pays from a different account than they
   are paid at cannot be represented. Dropping a uniqueness restriction cannot
   invalidate existing rows, but it is a migration against a live table.

**Fixtures for the prototype.** Two of the five eval cases run on **real data
already in the sandbox** — no fixture needed:

```text
eval 1   invoice 353a4c79 at `disbursed` (face 100.00) + deposit 99bea655
         (100.00, unattributed). The pair defect 6 separated.
eval 4   deposit 5ec3e2b9 (50,000.00), which matches no face value on the
         rail and must stay visible.
```

Evals 2, 3 and 5 need deposits created deliberately via
`POST /v1/mocks/payments/wire` (`src/lib/rails/circle-client.ts:176`) against
throwaway invoices, following the `scripts/eval-circle-fiat.mts` pattern from
cycle 2 — which creates what it needs and deletes everything it made.

**A fixture constraint that must be designed around, not assumed away:** the
platform creates every sandbox deposit itself, so all 13 carry an **identical
`source.id` and sender name**. A realistic mess cannot be waited for; it must be
staged. And slice 2's learned-sender behaviour has no honest sandbox
demonstration at all — see F4.

### 5. Screens & components

**One new route, a sibling to the existing ops queue:** `/ops/payments`, plus
`/ops/payments/[paymentId]` for the attribution view. It follows the
queue-to-detail pattern `DESIGN_SYSTEM_NOTES.md` records from `/ops` →
`/ops/deals/[id]`: server component, `export const dynamic = "force-dynamic"`,
`seatGate("ops")` **first, before any query**.

**Primitives reused, no new ones:**

| Need | Primitive | Source |
|---|---|---|
| The queue | `Table` / `Th` / `Td` | `src/components/ui/table.tsx` |
| Every amount | `Amount` (mono, tabular-nums, minor units in) | `src/components/ui/amount.tsx` |
| The payment's rail evidence | `ProvenanceBadge`, **solid but unlinked** — the cycle-2 third treatment: real evidence a reader cannot check themselves | `src/components/ui/provenance-badge.tsx` |
| Grouping | `Card` | `src/components/ui/card.tsx` |
| The money gate | `ConfirmDialog` — entries listed with Σ, "refused otherwise" | `src/components/ui/confirm-dialog.tsx` |
| Refusals | sentences in `text-refuse`, inline beside the control that caused them — never toasts | `DESIGN_SYSTEM_NOTES.md` |

**Colour, from the reserved semantics — no new colour is invented:**

- `--flight` (hollow, dashed) for a payment that has arrived and is not yet
  attributed. This is exactly its declared meaning — *initiated-not-settled* —
  and the cycle-2 note says pending money is its intended tenant.
- `--good` (solid) for fully attributed.
- `--refuse` for refusals only, never decoration.

**One vocabulary addition, named as a decision:** an **age affordance** — how
long a payment has been unattributed. Nothing in the vocabulary expresses
elapsed time. Proposed as mono 12.5px muted text in the row (`3d`, `6d`), with
no colour, because colour here would be a judgement the product is not entitled
to make: `5ec3e2b9` at six days old is **correct**, not alarming. If this lands,
it joins `DESIGN_SYSTEM_NOTES.md` when the cycle closes.

**Existing screens gaining nothing:** `/ops/deals/[id]` is untouched. A payment
attributed by hand renders there through the movements list that already exists,
because it is an ordinary `settlement_event` like any other.

### 6. Permissions

**Ops only**, enforced by the established two-line pattern
(`src/lib/roles/gate.tsx`):

```ts
const gate = await seatGate("ops");
if (gate) return gate;
```

**Deliberately not a layout.** The file's own comment records why, verified by
curl during cycle 0's A4 rather than theorised: a layout that withholds
`{children}` only hides them — the page still renders server-side and its data
still ships in the RSC payload. Gating at the page means the queries **never
run**.

**What an ungranted user sees:** the `RoleGate` card naming the required seat,
with a `returnTo` for deep links. No payment data is queried, let alone
rendered.

**Why ops and not a wider grant:** ops is the only seat that sees across
parties. A supplier must not see another supplier's payments; a funder must not
see a debtor's. This is a property of the seat model, not a choice made for this
feature — and `SEATS` gains no new value (`src/lib/roles/parse.ts:6`).

**The flag is not a permission.** `NEXT_PUBLIC_ENABLE_RECONCILIATION` is public
by name so the nav can hide the route, and is therefore checked **on the server
too** — the pattern cycle 2 established at
`src/app/api/webhooks/circle/route.ts:40`.

### 7. Error & edge handling

**The rail is unreachable.** The queue says so and shows nothing, rather than
showing an empty list. *"We could not reach the rail to ask what has arrived"*
is a different statement from *"nothing has arrived"*, and conflating them is
the failure mode this whole feature exists to remove.

**The rail cannot list inbound payments** (`demo-internal`, `usdc`). The screen
says *"this rail has no inbound payments"*. Never an empty list.

**Missing sender.** `CircleDeposit.source` is optional
(`src/lib/rails/circle-client.ts:115`). A payment with no sender is displayed
with the field blank and is still fully attributable — the sender is context for
a human, never a precondition.

**Double submission.** Two layers, and the eval tests the lower one:

- the button is disabled with its reason shown;
- **the server re-checks and refuses**, because a disabled button does not stop
  a double submit, a stale tab, or two people working the queue at once.

This codebase already learned that: `settlement_events_circle_payment_once`
(`src/db/schema.ts:205`) exists *because* the UI-level assumption failed when
webhooks delivered twice.

**Over-application.** A leg expecting 100.00 with 60.00 booked accepts 40.00 and
refuses 50.00. **This is a different guard from the one that exists** — before
part payments, "has this leg settled?" was yes/no; with them it is an amount.

**Attribution to a settled deal.** Refused with a named reason.

#### The two repairs, stated as their own work

**FIX A — the key scheme.** Replacement, never removal:

| path | key | guarantees |
|---|---|---|
| gate / webhook (**unchanged**) | `` `${type}:${invoiceId}` `` | one in-flight leg, one automatic booking |
| hand-attribution (**new**) | `` `match:${externalPaymentId}` `` | one payment spent exactly once, ever |

The namespaces cannot collide. Over-application is prevented by the
outstanding-amount check above, not by the key. `settlement_events_circle_payment_once`
continues to guarantee that one rail reference settles one thing.

**FIX B — ambiguity parks, it does not fail.** `completeSettlement` must
distinguish *"the rail's record contradicts what we expected"* — wrong amount,
wrong recipient, wrong chain, which is a genuine failure and stays loud — from
*"we cannot yet tell which payment is this leg's"*, which is an exception
awaiting a person. The first fails the leg. The second leaves it `initiated` and
surfaces the payment in the queue.

**FIX B's companion.** The candidate filter never asks whether a deposit has
already settled something, so a spent deposit keeps causing ambiguity. Excluding
payments already in `settlement_events.evidence_ref` removes a great deal of
ambiguity for free.

### 8. Human gates

| Consequence | The gate before it | Status |
|---|---|---|
| Money books against a leg | `ConfirmDialog` showing the exact entries and their Σ, server-recomputed | **new**, copying the cycle-0 money-consequence pattern |
| A part payment leaves a remainder | The same dialog, showing the `unapplied` entry explicitly | **new** |
| One candidate is chosen over another | Ops picks; a reason is **required** | **new** |
| A deal advances | None — it is derived from booked legs, and the booking was already gated | existing, unchanged |
| Gate-initiated settlement | `ConfirmDialog` on the deal page | **existing, not weakened** |
| Webhook-completed settlement | Ops authorised that exact movement at the gate | **existing, not weakened** |

**Every gate is before its consequence.** Nothing books and is then confirmed.

**The reason field — decided 2026-09-21: a fixed set plus an optional note.**

```text
Why this leg?
  ( ) The payer confirmed it
  ( ) The supplier confirmed it
  ( ) Earliest maturity, unresolved
  ( ) Other
  Note (optional) [______________________]
```

The escalation ladder — ask the payer via client support → confirm with the
supplier → failing both, the invoice with the **earliest maturity** — is a
policy, and a fixed set is what makes *"was it followed?"* answerable. Free text
cannot be reported on and cannot prove the ladder was walked. Steps one and two
happen off-platform; the product records their **outcome**, it does not perform
them. *"Ops picked one"* is precisely the audit answer this cycle exists to
prevent.

---

## Requirements register

Six epics. Each opens with a user story; the numbered requirements underneath
carry the acceptance criteria, the eval case that proves each, and the files it
touches.

### EPIC A — Repairs to the settlement substrate · `SLICE 1`

> *As ops, I want a leg to accept more than one payment and to survive an
> ambiguity, so that a part payment can be recorded and a temporary confusion
> does not destroy a legitimate leg.*

| ID | Requirement | Eval |
|---|---|---|
| A1.1 | A leg with 60.00 booked against 100.00 expected accepts a further 40.00 | 2 |
| A1.2 | The same payment cannot be booked twice by any path, including under a double submit | 5 |
| A1.3 | Existing gate and webhook behaviour is unchanged on the happy path | 1 |
| A2.1 | Two same-amount deposits + one open leg → the leg stays `initiated`; nothing booked, nothing failed | 3 |
| A2.2 | The payment appears in the queue with both candidate legs shown | 3 |
| A2.3 | Genuine mismatches (wrong amount, recipient, chain) still fail loudly | 3 |
| A3.1 | A payment already in `settlement_events.evidence_ref` is excluded from automatic matching | 3 |
| A3.2 | Two same-amount deposits, one already spent → the other matches cleanly | 3 |

**Files:** `src/lib/settlement/pending.ts` · `src/lib/rails/verify-circle.ts`

### EPIC B — See the money · `SLICE 1`

> *As ops, I want one screen listing every payment that has arrived in the
> platform's account — expected or not — so that no money the platform holds is
> invisible to the people accountable for it.*

| ID | Requirement | Eval |
|---|---|---|
| B1.1 | `circle-fiat` returns every deposit in the account, attributed or not | 1, 4 |
| B1.2 | `demo-internal` and `usdc` declare **unsupported** — not an empty list | — |
| B1.3 | An unsupported rail renders *"this rail has no inbound payments"* | — |
| B2.1 | The queue is built from the rail's answer | 4 |
| B2.2 | `webhook_deliveries` is never the source of a queue row | 4 |
| B3.1 | Each row shows amount · arrival time · sender · still unattributed · age | 1 |
| B4.1 | Attribution state is derived by SUM, never stored | 1, 2 |
| B5.1 | Only `first_seen_at`, owner and note are persisted; money facts come from the rail | 4 |

**Files:** `src/lib/rails/types.ts` · `circle.ts` · `usdc.ts` ·
`demo-internal.ts` · `index.ts` · `src/db/schema.ts` · new route

### EPIC C — Attribute it · `SLICE 1`

> *As ops, I want to attribute a payment to an open leg — all of it or part of it
> — and have the ledger book it through the same writer as every other movement,
> so that hand-matched money is indistinguishable in quality from automatically
> matched money.*

| ID | Requirement | Eval |
|---|---|---|
| C1.1 | Candidate legs are listed with each one's outstanding amount | 1 |
| C1.2 | A ConfirmDialog shows the exact entries and their Σ before anything books | 1 |
| C1.3 | The movement books through `bookMovement` — **no second writing path** | 1 |
| C1.4 | The deal advances via the existing `advanceFromBookedLegs` | 1 |
| C2.1 | A part payment's remainder books to the new `unapplied` account | 2 |
| C2.2 | `client_collections` still nets to exactly zero | 2 |
| C2.3 | The deal shows partially repaid, not repaid | 2 |
| C3.1 | Attributing a parked leg settles its `pending_settlements` row | 3 |
| C4.1 | Every attribution records who did it and when | 1 |
| C4.2 | A reason is required where ops chose between candidates | 3 |
| C4.3 | Evidence kind is `circle-payment-id` or `statement-line` as appropriate | 1 |

**Files:** `src/db/schema.ts` · `src/lib/settlement/pending.ts` · new action

### EPIC D — When it cannot be attributed · `SLICE 1`

> *As ops, I want money that matches nothing to stay on screen with its age and an
> owner, so that "leave it until it is matched" means visible and accountable
> rather than forgotten.*

| ID | Requirement | Eval |
|---|---|---|
| D1.1 | Two candidates → both shown, **neither ranked nor pre-selected** | 3 |
| D1.2 | Ops picks one, and C4 records the basis | 3 |
| D1.3 | Nothing books until ops picks | 3 |
| D2.1 | A payment matching no open leg remains in the queue indefinitely | 4 |
| D2.2 | It shows how long it has waited and who owns it | 4 |
| D2.3 | It is never forced onto a deal and never disappears | 4 |
| D3.1 | Every payment is either attributed or visibly unattributed with an age and an owner. **10 of 13 today → 13 of 13** | 4 |
| D3.2 | The rail's own balance is displayed beside what the ledger accounts for, and any gap is stated rather than hidden | 4 |

**Explicitly not the metric:** unattributed value reaching zero. `5ec3e2b9`
*should* stay unattributed; a product that drives that number down is a product
that forces bad matches. How the 13 divide is ops's judgement. That all 13 are
accounted for is the product's job.

**D3.2 added 2026-09-22, and it is the stronger claim.** `GET
/v1/businessAccount/balances` returns the rail's own figure — **$50,456.62
available** on the day of writing. Counting rows says *"we have looked at
everything."* A balance says *"the ledger agrees with the bank."* The second is
what a reconciliation feature should assert, and it costs one endpoint that
already works.

The gap is stated, never suppressed: on 2026-09-22 the rail held $50,456.62
against $50,105.00 unattributed, a difference of $351.62 explained by three
deals mid-flight whose money is attributed but not yet paid out. A displayed
difference with an explanation is reconciliation; a hidden one is not.

**Files:** new route · `src/db/schema.ts`

### EPIC E — Refusals · `SLICE 1`

> *As ops, I want the system to refuse me when I would double-book, over-apply, or
> attribute money to a finished deal, so that the ledger can never show money the
> bank does not hold.*

*Epics A–D prove the feature works. Epic E proves it cannot be made to lie.*

| ID | Requirement | Eval |
|---|---|---|
| E1.1 | A second attribution of the same payment is refused with a named reason on screen | 5 |
| E1.2 | The refusal holds **at the server**, not only in the UI | 5 |
| E2.1 | A leg expecting 100.00 with 60.00 booked accepts 40.00 and refuses 50.00 | 2, 5 |
| E3.1 | Attribution to a settled deal is refused with a named reason | 5 |
| E4.1 | Money is never returned to a sender | 5 |
| E4.2 | A payment is never amended | 5 |
| E4.3 | A booked attribution is never un-matched | 5 |

**Why E4.1 is absolute:** returning money is an outbound payout to an account
with no registered destination, on the say-so of whoever claims the money is
theirs. It is the most attractive thing on this screen to an attacker.
Unattributable money is **parked, not returned.** Returning money is its own
feature with its own approval path.

**Files:** new action · `src/db/schema.ts`

### EPIC F — Remember the sender · `SLICE 2` — **NOT BUILT (2026-09-24)**

> **Closed at slice 2's Gate 0.5 without being built.** F4.1 required the demo
> gap solved first; measuring it found that `source.id` identifies **the
> platform's own receiving VAN, not the payer** — 24 deposits, 2 distinct
> values, both of them our own registered wire accounts. Keyed on that field
> the learned rule is wrong by construction. Chetan's decision, recorded with
> the measurement, in `develop-2-epic-f.md`. **Everything below is preserved as
> designed, including the two corrections that did not go far enough** — the
> third reading is in that file.

> *As ops, I want a payment from a sender I have identified before to arrive
> already matched to a suggested leg, so that the same identification work is not
> repeated — while the booking decision stays mine.*

| ID | Requirement |
|---|---|
| F1.1 | `settlement_destinations` becomes a two-way register; `unique(partyId, rail)` is widened |
| F2.1 | A payment from a known account arrives pre-matched and highlighted |
| F2.2 | **Ops still confirms.** No automatic booking, ever |
| F2.3 | Matching is on exact `source.id` and exact amount — no fuzzy names, no scoring, no model |
| F3.1 | Ops can list every remembered binding and delete one |
| F4.1 | Slice 2's demo gap is solved deliberately before it is built — see below |

#### Amendment, 2026-09-22 — the register may already exist inside Circle

Checked against the live sandbox after Chetan asked why a banking partner's
statement could not be used instead. Two facts, and they change this epic's
shape:

```text
GET /v1/businessAccount/banks/wires/{id}/instructions
  trackingRef            CIR2NV7EX2
  beneficiary            CIRCLE INTERNET          ← not us
  beneficiaryBank        STANDARD CHARTERED BANK
  accountNumber          11001233428
  virtualAccountEnabled  TRUE
```

**A correction to what this design assumed.** `virtualAccountEnabled: true`
means `beneficiaryBank.accountNumber` is **not a pooled account** — it is a
Virtual Account Number **unique to the linked bank account**, and Circle
attributes a wire arriving there without any reference in the memo
([Circle: deposit fiat](https://developers.circle.com/circle-mint/howtos/deposit-fiat)).
The pooled-account-plus-trackingRef model is the fallback for when VANs are
off, not what this deployment is running.

**And the sandbox collision has a different cause than recorded.** All 13
deposits share `source.id = fbf1313c…`, which is **the id of the one registered
wire account**. It is not an artefact of mock wires being indistinguishable —
it is that only one bank account has ever been registered. Register more and
`source.id` differs per account. **F4's demo gap is therefore solvable**, by
registering several sandbox wire accounts rather than by staging fictions.

**What this would do to Epic F, if it holds.** Registering a counterparty's
bank account — which this product already does for payouts, and which *is*
`settlement_destinations.externalId` on the fiat rail — yields a Circle bank
account id. A deposit's `source.id` is then a **lookup**, not a learned rule:

```text
designed        ops identifies a sender by hand → the product remembers → suggests
if VANs hold    the counterparty's account is registered → source.id → party
                no learning, no suggestion, no probabilistic anything
```

That is smaller, deterministic, and removes F2's entire justification section.

#### TESTED 2026-09-22 — and the answer is yes

Run against the live sandbox at Chetan's direction, after confirming no delete
endpoint exists for wire accounts (`create`, `get`, `list` all resolve;
`delete` 404s), so the record below is permanent.

**Step 1 — a second bank account gets its own VAN.**

```text
account ONE  fbf1313c…  trackingRef CIR2NV7EX2  VAN 11001233428
account TWO  b5ac0172…  trackingRef CIR3YJPTAG  VAN 11001384839   (created 06:18)
```

**Step 2 — a deposit into the second VAN is tagged with the second account.**

```text
mock wire → CIR3YJPTAG / 11001384839, 13.57
deposit 1a26618a   source.id   b5ac0172…
                   source.name WELLS FARGO BANK, NA ****0020
```

**Step 3 — THE DECISIVE ONE. The VAN wins; the quoted reference is ignored.**

The first two steps varied the trackingRef and the account number together, so
they could not say which drove attribution — and only one of them is under a
real payer's control. So the third test crossed them:

```text
sent      trackingRef CIR2NV7EX2   (account ONE)
          accountNumber 11001384839 (account TWO's VAN)

returned  trackingRef CIR3YJPTAG    ← Circle REWROTE it to account TWO's
          source.id   b5ac0172…     ← attributed to account TWO
```

**Attribution follows the account number the money was sent to, not the
reference the payer quoted.** A payer who quotes nothing, or quotes the wrong
thing, is still attributed correctly.

#### What this does to the design

**Two claims made earlier in this file are now wrong, and are corrected here
rather than edited away:**

1. B3's *"the sender is genuinely useless as a discriminator"* was true of the
   data but wrong about the cause. The 13 deposits shared one `source.id`
   because **one bank account had ever been registered**, not because mock
   wires are indistinguishable. Register more and the sender discriminates
   exactly.
2. F4's demo gap is **solved**. Registering three or four sandbox accounts
   gives distinct senders, and slice 2's central behaviour becomes
   demonstrable.

#### Resolved 2026-09-23 — Epic F ships as designed

**The registration route is real but unavailable.** Further testing found that
the multiplier is the **wallet**, not the bank account: one linked account
returns a distinct, stable VAN per `?walletId=`, so per-supplier collection
numbers would need no counterparty bank details at all. Circle calls these
institutional subaccounts, and the sandbox entitlement is open
(`GET /v1/externalEntities` → 200; `POST {}` → 400 field validation, not 403).

Then Circle Customer Care, 2026-09-23:

> *"The Circle Mint Account is available only to businesses… please reach out
> to our Sales team to discuss your production access."*

**Subaccounts require a negotiated commercial agreement.** So this is a
documented production path, proven in sandbox, that this project cannot use.

**Therefore: Epic F ships exactly as written — learned senders, ops confirms.**
Not "pending an answer": the answer arrived and it was *unavailable*, which is a
firmer input than a pending one. The registration design is recorded below and
in `CYCLES.md` against cycle 10, for whoever has the commercial relationship.

The shape it would take, if it ever becomes available:

```text
as designed   ops identifies a sender by hand → the product remembers → suggests
as tested     the counterparty's bank account is registered → it gets a VAN →
              they wire to it → source.id IS the party. A lookup.
```

That removes the learned rule, the suggestion surface, F3's rule management,
and F2's entire justification section — **and with them the only probabilistic
thing this design ever contemplated putting near the money path.**

**The residual uncertainty, which is real.** This is the sandbox's **mock**
wire endpoint, which takes the account number as an input and resolves it. A
production wire is attributed by the beneficiary account number the payer's
bank actually sends to — the same field — so the mechanism should hold. But
"should hold" is not "was observed in production", and this is a money path.
**Treat it as strong evidence, sufficient to design against, and not as proof
fit for a compliance statement.**

**What this does NOT solve, so the cycle stands:** money from a payer with no
registered account, a part payment, an amount that matches nothing, a settled
deal, or a duplicate. Epics A through E are untouched by this finding. It
shrinks slice 2; it does not shrink slice 1.

#### How many VANs, and who pays for them (Chetan, 2026-09-22)

**The asymmetry that decides it.** Money goes OUT to suppliers (disbursement,
residual) and funders (payout), so their bank accounts must be registered
regardless. Money comes IN from funders and debtors — and **a debtor is never
paid, so registering one is work that exists purely for reconciliation.**
Debtors are also the many side: one supplier sells to many buyers, so debtor
count grows fastest. The whole cost question is the debtor side.

Today: 2 suppliers · 1 funder · 3 debtors · 6 supplier×debtor pairs, and
**one** registered payout destination — the platform's own.

**Decision: VANs per supplier programme, not per debtor.**

| Option | Extra accounts | Attribution |
|---|---|---|
| One VAN (today) | — | none; every payment looks identical |
| **Per supplier programme** | **zero** — registered for payouts already | "this is for Amber Textiles" |
| Per debtor | +1 each, growing fastest | "this is Halvorsen's payment" |

Each supplier's buyers wire to that supplier's VAN. What remains unresolved is
ambiguity **between one supplier's own invoices of the same amount** — and the
supplier is known, their open invoices are known, and they can be called. A
dramatically smaller problem for zero additional accounts. Per-debtor VANs
become an upgrade bought for high-volume debtors, not a platform-wide cost.

**Who bears the cost:**

| VAN | Borne by | Reason |
|---|---|---|
| Platform main account | platform | its own account, its own vendor choice, benefits every deal — into the spread |
| Per funder | platform | funders are scarce and courted; charging them for plumbing is a bad trade |
| Per supplier | platform, and it is free | the account exists for payouts already |
| Per debtor | supplier, recovered in the rate | the debtor is the supplier's customer and the supplier's programme benefits. **Never a line item charged to the debtor** — there is no commercial relationship to charge against |

**Two things to establish before this is built, neither blocking slice 1:**

1. **Circle's per-account pricing is unpublished.** The fee schedule is behind a
   support page that does not render. The question to ask is narrow: *is a
   linked bank account or VAN charged per account, per month, or not at all?*
   Per-account-per-month is the only answer that makes per-debtor VANs
   expensive. The break-even is computable from this project's own data — 3 of
   13 deposits unattributed before the VAN test, so roughly 1 in 11 once the
   two API-exploration artefacts are excluded.
2. **Using a supplier-linked account's VAN as a COLLECTION account touches
   client money.** The funds credit the platform's balance, tagged to an
   account record in the supplier's name. Operationally sound; worth confirming
   with Circle and with client-money advice, because it is adjacent to cycle
   10's segregation work.

**Where the pricing half belongs: cycle 6, the programme.** `CYCLES.md` already
records that `src/lib/pricing/` never mentions `rail`, so "the settlement rail
is a priced decision" is a claim the code does not yet make. Who bears rail
costs is exactly the gap that cycle closes. Cycle 3 records the decision and
builds nothing on it.

**Why suggest rather than book** *(considered at Discovery, and auto-booking was
chosen then reversed on the reasoning below)*: nobody authorised **that**
payment — only a resemblance to a previous one.
`src/app/api/webhooks/circle/route.ts:18-21` states that unattended booking is
permissible precisely because ops authorised that exact movement at the gate,
and that nothing probabilistic may sit on the booking path. A learned rule would
be the first probabilistic thing on it.

**F4 — the demo gap, recorded before it is built.** All 13 sandbox deposits
carry an identical `source.id`, so under F2 every payment would suggest the same
party. The suggestion is harmless — ops rejects it — but **slice 2's central
behaviour cannot be honestly demonstrated in sandbox.** Either the fixtures
stage deposits from distinct simulated senders, or slice 2 records the behaviour
as unproven. It will not resolve itself.

**Files:** `src/db/schema.ts` · new migration · new action · new route

---

## Part 2 — The agent question (default no)

**Step needing judgment: none. Conceded.**

The candidate for an agent is workflow step 5 — choosing between two legs a
payment could belong to. It does not survive the four questions.

**What would it read that product logic cannot evaluate?** Nothing. **There is
nothing to read.** A Circle deposit has nine fields, verified against the live
sandbox on 2026-09-21:

```text
amount · createDate · destination · fromAmount · id
source · sourceWalletId · status · updateDate
```

No memo, no tracking reference, no narrative, no free text of any kind. The
`memo` the platform sends on every inbound wire (`src/lib/rails/circle.ts:126`)
**does not come back**. Product logic can evaluate all nine fields exactly —
amount comparison is arithmetic, sender comparison is string equality on an id,
timing is a date comparison. An agent would be re-deriving exact comparisons
probabilistically. Judgment needs something to weigh, and this payload offers
nothing.

**Cost per run vs value per case.** At the origin project's measured ~11¢/call,
every payment view costs money to produce an answer `===` already produces
exactly and for free. Thirteen payments is $1.43 to re-compute arithmetic.

**Failure mode, and whether Part 1's gate contains it.** The failure mode is a
plausible-but-wrong match presented with confidence. Part 1's gate — ops
confirming in a dialog — contains the *booking*, but **not the harm**. D1.1
exists precisely because a ranked list is a judgement the product is not
entitled to make: two identical $100 deposits are genuinely indistinguishable,
and an agent that picks one has invented information. The honest answer is
*"these two, you decide"*, and honesty here is deterministic.

**Verdict: NO AGENT.** The feature ships as Part 1 alone.

**Where an agent would earn its place, recorded so the door stays open:** if
bank-statement narratives ever arrive as free text — *"PAYMENT REF INV-2291
ACME LTD"* — there would finally be something to read, and reading it would be
judgment. That path is CSV / statement import, which this cycle explicitly puts
out of scope. The agent question is worth re-asking in the cycle that brings it
in, and not before.

---

## Part 3 — Agent blueprint

**Not run.** Part 2 returned NO AGENT.

---

## Build order

**Decision: TWO SLICES.** Recorded although Part 3 did not run, because the
split is a scope decision rather than an agent decision.

```text
SLICE 1   Epics A · B · C · D · E
          Resolves the $50,105 on its own. Complete and demonstrable alone.
          Goes through Develop first.

SLICE 2   Epic F
          Built second, against a working substrate. Needs the F1 migration.
          Has a known demo gap (F4) to solve before it is built.
```

**Outcome, 2026-09-24: slice 1 built and deployed; SLICE 2 NOT BUILT.** F4 was
the gate the design put in front of it, and F4 held — the gap is real and its
cause is not what this file recorded. The build order was right; what it
guarded against turned out to be fatal rather than solvable. Evidence:
`develop-2-epic-f.md`.

Slice 1 is a complete feature without slice 2: ops sees the money and attributes
it by hand every time. Slice 2 only removes repeated work, and only makes sense
on top of a queue that already exists. Cycle 2 was 55 files and 17 commits and
produced eight defects with less scope than slice 1 and slice 2 combined.

---

## Integration contract

**Feature folder:** `src/features/reconciliation-ops/` — holding `MANIFEST.md`
and the feature's own AGENTS block, per the cycle-2 pattern
(`src/features/circle-fiat/MANIFEST.md`).

**Route files (new):**

```text
src/app/ops/payments/page.tsx                  the queue
src/app/ops/payments/[paymentId]/page.tsx      the attribution view
src/lib/reconciliation/*.ts                    queries + the attribution action
src/components/payment-*.tsx                   the queue row and age affordance
drizzle/0007_*.sql                             unapplied kind + inbound_payments
```

**Flag:** `NEXT_PUBLIC_ENABLE_RECONCILIATION` — **absent means off, never an
error**, checked on the server as well as in the browser.

**Allow-list — every existing file to be modified, each with its reason:**

| File | Reason |
|---|---|
| `src/db/schema.ts` | the `unapplied` account kind; the `inbound_payments` table; slice 2's widened unique constraint |
| `src/lib/rails/types.ts` | the `listInbound()` capability on the `Rail` interface |
| `src/lib/rails/circle.ts` | implement `listInbound()` from the existing `listDeposits()` |
| `src/lib/rails/usdc.ts` | declare `listInbound` **unsupported** — no payment arrives from outside |
| `src/lib/rails/demo-internal.ts` | declare `listInbound` unsupported |
| `src/lib/rails/index.ts` | export the new capability through the registry |
| `src/lib/rails/verify-circle.ts` | **FIX B** — ambiguity parks rather than fails; **A3** — exclude spent payments from candidates |
| `src/lib/settlement/pending.ts` | **FIX A** — the replacement key scheme; **C3** — settle a parked row on hand-attribution |
| `src/app/ops/page.tsx` | the flag-gated link and unattributed-count indicator |

**Additive-by-default holds for everything off this list.** An unnamed
modification is a **stop-and-ask** in Develop.

**Untouchable — unchanged from cycle 2, with one addition:**

```text
src/lib/domain/states.ts     byte-identical. Its line 3 already says the full
                             machine including reversals is later-cycle design,
                             and reversals are out of scope here.
src/lib/money/               the parser. Not lifted this cycle.
src/lib/ledger/index.ts      READ-ONLY USE. This feature calls bookMovement and
                             does not modify the sole writer. Any change here
                             is a stop-and-ask.
vercel.json                  untouched.
existing components off-list untouched — /ops/deals/[id] gains nothing.
```

`src/lib/ledger/index.ts` being read-only is the contract's most load-bearing
line: **this feature adds a new way to decide what books, never a new way to
book.**

**Permitted imports for new files:** `@/components/ui/*` · `@/lib/cn` · the
drizzle schema (type-only where possible) · `lucide-react`.

---

## Eval plan

| # | Case | Passes when | Fails when |
|---|---|---|---|
| **1** | **Happy path, real data.** Invoice `353a4c79` sits at `disbursed`; deposit `99bea655` ($100) sits unattributed. Ops opens the queue, sees sender/amount/date/age, and attributes it. | The ledger books the repayment, the deal advances past `disbursed`, the queue's unattributed count drops by one. | It books but the status does not move — the defect `advanceFromBookedLegs` was written for. |
| **2** | **Part payment.** A deposit smaller than the open leg expects. | The deal shows partially repaid; the remainder sits in `unapplied`; `client_collections` still nets to exactly zero. | It books the full amount, refuses outright, or the books stop balancing. |
| **3** | **Ambiguous.** Two open legs want the same amount; one deposit arrives. | Both candidates shown, **neither suggested**; the leg stays `initiated` rather than failing; ops picks; the reason is recorded. | The product picks one — defect 6 wearing a new hat. Or the leg is marked `failed`. |
| **4** | **No target, real data.** `5ec3e2b9` ($50,000) matches nothing and never will. | It stays visible and unbooked, with an age and an owner. 13 of 13 payments accounted for. | It is invisible, forced onto something, or ages into nowhere. |
| **5** | **The boundary — the refusals hold.** The same payment attributed twice; an amount larger than outstanding; a payment onto a settled deal. | All three refused with named reasons, nothing booked — **and the refusals hold at the server**, tested by calling the action directly rather than through the disabled button. | Any one books. Or a refusal arrives as a 500 with no explanation ops can act on. |

**Case 5 is the boundary case.** With no agent, it tests the hard limits rather
than a refusal to reason — and it is tested at the server layer deliberately,
because that is the layer a race can reach.

---

## Build-readiness gate

| Question | Answer |
|---|---|
| Job in one sentence | **yes** — Part 1 §1 |
| Every fact traced to a named file or table | **yes** — every claim cites a path read on 2026-09-21 |
| Missing-data behaviour known | **yes** — rail unreachable, rail unsupported, and missing sender each have a stated behaviour in §7 |
| Human gate before every consequence | **yes** — §8; every gate precedes its consequence, and no existing gate is weakened |
| One eval case tests the limit | **yes** — case 5, at the server layer |
| Contract names every existing file to be touched | **yes** — nine files, each with its reason |
| If Part 3 ran | **n/a** — Part 2 returned NO AGENT |

**Two open questions, neither of which blocks.**

1. **Whether Circle's production deposit payload carries a reference the sandbox
   drops.** The design assumes it does not, which is the safe direction — a
   matching scheme that never relies on a payer-quoted reference works either
   way. It would only ever add an affordance, never remove one.
2. ~~Whether VAN attribution would let slice 2 become a registration lookup.~~
   **CLOSED 2026-09-23.** The mechanism works and the multiplier is the wallet,
   not the bank account — but Circle Mint subaccounts require a business entity
   and a negotiated commercial agreement, so this project cannot use them.
   **Slice 2 ships as designed.** Recorded in `CYCLES.md` against cycle 10 for a
   commercial deployment.

**Bank-statement import stays out of scope, and the reasoning is now stronger.**
Chetan asked why the banking partner's statement could not be read directly. It
could — a statement line carries the remittance narrative, which is exactly the
field Circle's deposit record drops. But the platform holds no bank account
(`beneficiary: CIRCLE INTERNET`), so there is no statement addressed to it; and
a VAN gives the same attribution **structurally** — an exact id match rather
than free text a bank may truncate or reformat. Narrative parsing would also be
the one change that reopens Part 2's agent question, which the VAN path does
not.

---

## Decisions taken at this Design, for the record

1. **Attribution state is derived, never stored** — consistent with balances and
   with `advanceFromBookedLegs`, rather than a fourth place money state lives.
2. **The list comes from the rail, not the delivery log** — proven, not
   preferred: the delivery log begins 2026-09-18 and two unattributed deposits
   arrived 2026-09-15.
3. **Hand-attribution does not open a pending row**, because the money has
   already arrived — but it settles one that exists.
4. **The reason is a fixed set plus an optional note**, so "was the ladder
   followed?" is answerable.
5. **A remembered sender suggests; it never books** — reversed from the earlier
   auto-booking decision on the reasoning in Epic F.
6. **NO AGENT**, conceded rather than argued down: the payload has nine fields
   and no free text, so there is nothing for judgment to weigh.
7. **The rail's balance is displayed beside the ledger's account of it**
   (D3.2, added 2026-09-22) — "the ledger agrees with the bank" is a stronger
   claim than "we have looked at every row", and costs one existing endpoint.
8. **Bank-statement import stays out**, and Virtual Account Numbers are
   investigated at Develop instead — structural attribution rather than
   narrative parsing, and it does not reopen the agent question.

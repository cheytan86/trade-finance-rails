# The cycles — order, rationale, and what may be dropped

Twelve cycles, each run through the five-phase process (Discovery → Design →
Develop → Deploy → Release). This file records **why the order is what it is**;
the live tracker is `PRD.md` §11, and each cycle's phase outputs land in
`docs/product/<slug>/`. Decided 2026-09-05, re-sequenced so the headline ships
mid-project instead of last.

The **track** column is the *expected* weight-test outcome, not a verdict — the
test (model calls · money movement · schema changes · auth changes · many
files) is run honestly at each cycle's Discovery, and a cycle may earn LIGHT
that was expected FULL. Cycle 0's ran 2026-09-06: FULL, four of five.

| # | Cycle | Track (expected) | Needs | Why here |
|---|---|---|---|---|
| 0 | **Foundation** — scaffold, migrations-from-commit-one, double-entry ledger core, role switch, deploy pipeline, the three copied modules | FULL *(confirmed)* | nothing | Nothing exists to protect yet — the one cycle with no allow-list (NEW mode). Everything later attaches to what it creates. |
| 1 | **Settlement seam + USDC rail** | FULL | 0 | Proves the rail abstraction on the rail that already works; mode 3 (all-stablecoin) falls out. **The one to get right** — every later rail is an implementation behind this interface. |
| 2 | **Fiat rail — Circle sandbox** | FULL | 1 | Async settlement, webhook signatures, idempotency, out-of-order delivery. First step: fund the sandbox balance and register a test bank account (recorded in STACK_RULES.md so it isn't a mid-cycle surprise). **Async-only — hybrid moved out 2026-09-15, see the programme note below.** |
| 3 | **Reconciliation ops** | FULL *(confirmed)* | 2 | The five exceptions, fixed at Discovery 2026-09-21: unmatched payment · ambiguous match · part payment · exception aging · the double-book refusal. **Reversals and failed screening moved out — see the note below.** **Mode 1 (all-fiat) completes here**; mode 2 (hybrid) now completes at cycle 6 with the programme. |
| 4 | **Rail comparison v1** *(renamed from "Priced rail comparison v1", 2026-09-24)* | **FULL** *(confirmed at Discovery; the "likely LIGHT" prediction was wrong)* | 1–3 | **The headline, pulled forward** — one invoice, three rails, **speed and risk** side by side, both measured from the product's own `pending_settlements` records rather than asserted in prose. Needs only cycles 1–3. **Cost was removed from v1 on 2026-09-24**: Circle publishes no fee schedule and the sandbox charges nothing, so one of three cost cells has no honest number — see the note below. Extends when the third rail lands (11). |
| 4a | **Accounts mode** — real sign-in behind the `getIdentity()` seam, user↔party binding, onboarding; `AUTH_MODE` switch, second (login-gated) deployment | FULL | 0, 4 | *Added 2026-09-06 at Chetan's direction.* One codebase, two deployments — never two repos. Slotted after the headline so the job-search asset is never delayed by auth work. Adds ~3 weeks plus a both-modes test surcharge on every later cycle — accepted knowingly. |
| 5 | **Funding models** — on-demand + committed facility, positions in the ledger | FULL | 1 | Undrawn carry displayed — instant funding costs the funder carry, and the product shows it rather than pretending it's free. |
| 6 | **Credit assessment + the programme** — written policy, deterministic scorecard (every score cites its rule), rating, real registry lookup (never scored); **plus the programme itself**: the supplier × buyer RPA holding the grid (rate by rating band × tenor), the tier schedule, and the **settlement arrangement**. Pricing becomes **read-only** — the system applies the signed grid; ops overrules only with a recorded reason. Hybrid mode completes here. | FULL | 1, 2 | The KYC method applied to a third domain — the portfolio's thesis. Calibration disclaimed wherever scores render. *Scope extended 2026-09-15 — see the programme note below.* |
| 7 | **Limits & portfolio** — supplier facility · supplier×buyer sub-limit + concentration rule · platform debtor limit; watchlist, DPD | FULL | 5, 6 | Limits enforce against ledger positions (5) using ratings (6). Refusal names which level binds and shows its arithmetic. |
| 8 | **Invoice verification** — assurance tiers wired to eligibility/advance rate, T3 confirm link, DCSA shipment adapter, on-chain attestation | FULL | 1, 3, 6 | Tiers price evidence; insurers care about tier, so it lands before insurance. Carrier sandbox attempted, labelled mock fallback. |
| 9 | **Insured variant** — Allianz Trade sandbox / labelled mock, premium pass-through, claim = ledger evidence pack | FULL | 6, 8 | Carrier limit sits beside ours; a missed declaration window voids cover the way it does in reality. |
| 10 | **The custody cycle: facility escrow + client-money segregation** — drawdown gated on attested tier ≥ mandate; the escrow generalized into demonstrable segregation of client money from platform funds, with the daily proof beside it | FULL | 5, 8 | *Scope extended 2026-09-07 (Chetan — the bankruptcy-remoteness challenge, paper Q18).* Foundry enters. Proved by refusal: unattested can't draw, T1 can't satisfy a T2 mandate. On-chain balance == ledger balance — now doing double duty as the segregation proof: the one custody structure a demo can actually run. |
| 11 | **Multi-token + Visa adapter** — mock Open USD ERC-20, VSP adapter (designed-for, mock — no public API), comparison extends to the third rail | FULL | 1, 4 | Forces chain identity to be explicit per transaction; completes the headline. The mock must say it's a mock wherever it renders. |

## The droppable tail

**Cycles 9–11 are the droppable tail.** If the ~18 weeks of evenings run out,
the project still stands at cycle 8: three settlement modes, the priced
comparison, both funding models, the full credit layer, and verification
tiers. Cycles 6–8 are *not* droppable — credit, limits and verification were
each an explicit scope decision (2026-09-05/06), chosen knowing their cost.

## The programme — where pricing and the rail stop being per-deal choices

**Decided 2026-09-15 (Chetan), from a question asked while reviewing cycle 2's
screen mockups: "why does pricing have an option for settlement rail?"**

The honest answer was that it shouldn't. Two findings came out of checking:

1. **`src/lib/pricing/` never mentions `rail`** — not once. The rail sits on
   the pricing form for *sequencing* reasons and affects **no number**. Ops
   types the transaction cost by hand. So the product's one-line claim — the
   settlement rail is an explicit, *priced* decision — was a claim the code
   did not make.
2. **`invoices.rail` is one column per deal**, but the paper's frame is per
   *leg*, and hybrid mode (funder pays USDC, supplier receives fiat) is two
   rails inside one deal. A single column cannot express it.

**The resolution, and it is Chetan's idea rather than the paper's:** the
**programme** — the supplier × buyer agreement, signed as an RPA — carries the
head terms, and pricing *applies* them read-only. The paper already specifies
the grid this way (§ "Programme pricing lives in the RPA… per invoice the
system *applies* the signed grid, deterministically… one supplier selling to
three buyers sees three rates"), and the deal flow already says ops "approves,
or overrules with a recorded reason". What the paper does **not** yet say, and
now will: **the settlement arrangement is a programme term too.**

Consequences, all of which simplify rather than add:

- **The rail stops being a per-deal choice**, which is also how it works
  commercially — a supplier's RPA names the account they are paid into; nobody
  selects a payment rail per invoice.
- **Hybrid becomes a programme *type*, not a toggle.** "Funder settles in
  USDC, supplier receives fiat" is a property of the agreement.
- **Per-leg rails fall out for free** — the arrangement can name a rail per
  leg with no per-deal UI and no per-deal schema.
- **Cycle 4's comparison gets a sharper subject**: programmes a supplier could
  be offered, rather than toggles an operator could flip.

**Where it lands: cycle 6, renamed "Credit assessment + the programme".** A
rating with no grid to feed is useless and a grid with no rating is arbitrary
— they are one idea, and splitting them would build each against a stub.

**What cycles 2–5 must therefore accept:** the rail picker on the pricing form
is **scaffolding with a known end date**. It stays selectable until programmes
exist, and `invoices.rail` remains the per-deal snapshot — the same pattern
`pricingSnapshot` already uses. Cycle 6 makes it derived; nothing before
cycle 6 should deepen the per-deal model.

## Standing design rule — client-money segregation (from cycle 2 onward)

**Decided 2026-09-07 (Chetan's bankruptcy-remoteness challenge; paper §10
Q18 carries the full analysis and costs).** From the fiat-rail cycle onward,
client money — collections in transit, funder capital awaiting deployment —
**never shares an account or a wallet with the platform's own funds** (fee
income, operating balances). The chart of accounts and the wallet layout
enforce the trust-account shape structurally; the account-level proof makes
it visible; cycle 10 makes it contractual. The cycle-1 conduit treasury is
the last cycle allowed to commingle, and only because its money is synthetic.

## Standing deferral — the UI and information architecture revisit

**Decided 2026-09-06, Chetan, after walking the cycle-0 spine:** the screens
work and the visual identity is settled, but the *structure* — how surfaces
are laid out, what belongs on one screen, how an operator moves between them
— is deliberately not being refined yet. Judging information architecture
against six screens is guesswork; the app needs more surfaces before the
answer is evidence rather than taste.

**The trigger: revisit after cycle 4 (the priced comparison).** By then the
headline screen exists, credit and limits are close behind, and the real
density of the product is visible. Until then, new surfaces follow the
cycle-0 vocabulary rather than inventing their own — drift is the thing to
avoid while the redesign is pending, and `design-kit/DESIGN_SYSTEM_NOTES.md`
holds the vocabulary.

## Two cycle-2 findings that cycle 3 never reached (2026-09-24)

**Found at cycle 2's R0 re-run**, which measured its own X and discovered that
two of the four findings it named had not been addressed anywhere in cycle 3 —
not built, not deferred with a reason, simply not reached. They are given a
home here so the next R0 does not find them open for a third time.

| finding | where it came from | routed to |
|---|---|---|
| **An open page never learns that money moved.** `revalidatePath` invalidates the server's cache; it does not push to a tab someone already has open. Immediate rails could not produce this. A deferred rail can: someone watches a screen while the thing they are waiting for happens elsewhere. | `circle-fiat/deploy.md` finding 3; cycle 2 R0 point 3 | **The UI and IA revisit** (standing deferral above, after cycle 4). It is a surface-behaviour problem, and cycle 3's Deploy found a second instance of the same family — a click on a money screen that showed two seconds of nothing. Both belong to the same pass. |
| **The value-date question.** The repayment date is the date the platform receives the money — decided at cycle 2's R0 and correct for what the ledger records. The consequence stands: a debtor who pays on time through a slow bank is recorded as late, and the supplier's residual bears the overdue interest. Whether a bank-supplied value date can be captured and trusted is unanswered. | `circle-fiat/design.md` open decisions; cycle 2 R0 point 4 | **Cycle 6 — the programme.** A value date is a term of the settlement arrangement, not a rail detail, and cycle 6 is where pricing and settlement stop being per-deal choices. Circle's deposit record carries nine fields; whether any is a usable value date is a question for that cycle's discovery. |

Neither is part of cycle 2's current X, which turns on cycle 3 slice 2. They
are carried, not blocking.

## Cycle 3's scope, fixed at its Discovery (2026-09-21)

**Two changes to what row 3 promised, both Chetan's, both recorded rather than
absorbed.**

**Reversals move out to a cycle of their own, with credit loss.** Three reasons
found while grilling cycle 3. They need contra-entry machinery inside
`src/lib/ledger`, the sole writer. A booked deal would have to move backwards
through `src/lib/domain/states.ts`, which is untouchable and whose line 3
already reads *"The full machine (matured-unpaid, holds, reversals) is
later-cycle design."* And they cannot be honestly evaluated in a sandbox where
no deposit is ever clawed back — any eval would be a fiction written by the
person it is meant to test. The hard case is not a matching problem at all: a
reversal *after* payout drives `client_collections` negative, breaking the
nets-to-zero property cycle 2 verified, and needs a platform receivable account
that does not exist.

**Failed sanctions screening moves to follow cycle 6.** Nothing in the roadmap
builds screening before then; an exception cannot be handled before it can
occur.

**What cycle 3 gained instead:** a new `unapplied` account kind (the paper
assumes it three times; `grep -i unapplied` across `src/` and `drizzle/`
returns zero), a `listInbound()` rail capability, and a register of which
external bank account belongs to which party.

### Cycle 3 closed with one epic unbuilt (2026-09-24)

**Epic F — remember the sender — was designed and NOT built.** Its own F4 gate
required the sandbox demo gap solved before building. Measuring it at slice 2's
Gate 0.5 found the gap is real and its cause is not what the design recorded:
**`source.id` identifies the platform's own receiving Virtual Account Number,
not the payer.** 24 deposits carry 2 distinct values, and both are our own
registered wire accounts. A rule learned on that field would suggest by which
of our mailboxes the money arrived in, so with N debtors it is wrong by
construction rather than by accident.

The deterministic alternative the design itself wrote out — one VAN per
counterparty, making `source.id` a lookup rather than a learned rule — needs
Circle **institutional subaccounts**, which need a negotiated commercial
agreement. It is recorded against **cycle 10** with the rest of the segregation
mechanism.

Full measurement and reasoning: `docs/product/reconciliation-ops/develop-2-epic-f.md`.

**Two consequences carried forward:**

1. **`unapplied` ships declared and unused.** Slice 1 did not need it (a part
   payment has no remainder — the LEG is short) and slice 2 was not going to.
   Its tenant is an **overpayment control**: `debtor_cash −X / unapplied +X`
   when the payer is known but the invoice is not. Whichever cycle takes
   overpayment on should build it. A declared-and-unused enum value is the
   shape that produced two real defects in this project already.
2. **The inbound target is discovered, not configured — and it has moved.**
   `platformInboundTarget()` (`src/lib/rails/circle.ts:69`) takes
   `accounts.find(a => a.status === "complete")`. Wire account `b5ac0172` was
   `pending` on 2026-09-22 and is now `complete` and listed first, so the
   platform is telling debtors to wire to the account created for a test.
   Nothing is broken — matching is on amount and window — but the design named
   this a latent defect and it has now fired, caught only by a measurement
   taken for another purpose. **Trigger: the first cycle that touches
   `circle.ts` again**, most likely cycle 6.

**The finding that justified the cycle.** Reconciling the live Circle sandbox
against `settlement_events` on 2026-09-21: **13 deposits, 10 attributed, 3
unattributed, $50,105.00**. `docs/product/circle-fiat/release.md` had recorded
as fact that one deposit worth $100 was unreconciled, and that statement was
the basis of a go/no-go decision. It was wrong by $50,005 — not through
carelessness, but because nothing in the product could check.

Full reasoning: `docs/product/reconciliation-ops/discovery.md`.

## Cycle 4 lost its cost column — and cycle 6 gained a defect (2026-09-24)

**Decided at cycle 4's Discovery grill, Chetan's.** The cycle was designed as
*cost/speed/risk side by side*. Cost came out of v1, because one of the three
cells cannot be filled honestly: Circle publishes no fee schedule (cycle 3's
design recorded the page as *"behind a support page that does not render"*) and
the sandbox charges nothing. The alternatives were to seed it with a labelled
assumption or to show the gap; Chetan chose to drop the column rather than
carry a number that is an input dressed as evidence.

**What that costs, stated rather than absorbed:** `YOUR_PRODUCT.md` frames this
product as one where the rail is *"an explicit, **priced** decision"*. Cycle 4
now proves *explicit* and *measured*, not *priced*. The claim stays half-proven
until rail costs land in cycle 6's signed grid.

**What cycle 4 gained instead:** speed and risk both become **measurements**
rather than prose. `pending_settlements` has carried `rail`, `initiatedAt` and
`resolvedAt` for every leg since cycle 2 — `settleLeg` is rail-neutral, which
was that cycle's FIX 1 — and nothing has ever read it. Measured on 2026-09-24:
circle-fiat 29 legs, median 54.9 s, slowest 10.2 min; demo-internal 7 legs;
usdc **zero**, because cycle 1's Base Sepolia settlements predate the table.

### The defect this routed here

**`txnCost` is a margin line wearing a fee's clothes.** `src/lib/pricing/index.ts:50-62`:

```text
supplierDisbursement = principal − supplierInterest − txnCost
platformMargin       = funderFinancing − supplierDisbursement
```

The transaction cost is deducted from **the supplier**, and since margin is the
gap between the two sides, it flows straight into `platformMargin`. Meanwhile
`account_kind` has no expense account, so the platform paying Circle a wire fee
is not a movement this ledger can record. The product charges a cost, books it
as margin, and never records paying it.

That contradicts two things already written down: the code's own comment two
lines below (*"fees are visible lines, never margin (paper §7/§9)"*), and the
rail-cost policy set on 2026-09-22 — under which the supplier bears **only**
per-debtor VANs, **recovered in the rate, never as a line item**, while the
code charges them every transaction cost as a line item.

**Cycle 6 owns it**, alongside the rail-cost pricing already routed there.

### And the supplier-facing view

Chetan's instinct at the grill: the supplier should know rail costs before
setting up a programme. Not buildable now — **the programme does not exist**
(cycle 6 builds it), and under the 2026-09-22 policy the supplier is insulated
from rail costs, so the view would today show three identical numbers. Routed
to cycle 6, where both objections dissolve.

## Neither party can see what they were paid (2026-09-24)

**Found by Chetan walking the spine end to end during cycle 4's FIX 1 smoke
path, and — for the supplier half — independently by cycle 4's Discovery
reading the file the same day. Two routes to the same finding.**

Neither is caused by FIX 1, and both predate it. Neither is a defect in
anything that was built; both are surfaces that were never built.

### The supplier cannot see the residual, or the disbursement, or anything

`src/app/supplier/page.tsx:119-124` renders **four columns**: debtor · face
value · due date · status. That is the supplier's entire view of their own
money.

So a supplier is paid **twice** — the disbursement at funding, the residual at
settlement — and **sees neither amount**. They watch a status pill change. The
`supplier_payable` account exists and is resolved in `src/lib/queries.ts:54`,
and **no supplier-facing screen reads it.**

`src/lib/pricing/index.ts` computes `supplierDisbursementMinor` and
`supplierResidualMinor` on every pricing run. Both are shown to ops. Neither
reaches the person they belong to.

### The funder cannot see what they earned

`funderPositions` (`src/lib/queries.ts:243`) filters
`inArray(invoices.status, ["funded", "disbursed"])`. Once a deal repays, it
**leaves the list**.

That is defensible — a position is capital currently deployed, and repaid
capital is not deployed. But the consequence is that the funder's cash balance
rises by their return and **nothing on their screen says which deal produced
it.** No closed positions, no return history. They can see they are richer and
not why.

The deal page already concedes the point in a comment at line 359: *"the
funder's own decision surface arrives with the funding-models cycle."*

### Where they go

```text
the supplier's money view   CYCLE 6 — the programme. It is the same screen
                            as the supplier-facing rail view above: a
                            supplier who can see what they were paid is
                            part of what a signed programme means.
the funder's closed book    CYCLE 5 — funding models, which already promises
                            "positions in the ledger" and the funder's own
                            decision surface.
```

**Not fixed in cycle 4**, deliberately: both are screens rather than lines,
`/supplier/page.tsx` and `/funder/page.tsx` are off this cycle's allow-list,
and the supplier view needs a decision nobody has taken — whether a supplier
sees the platform's margin.

## The three-account restructure — proposed at cycle 3, routed to cycle 10

**Proposed 2026-09-21 (Chetan):** split the account model into a Disbursement
account, a Repayment account, and a Cash account for platform income.

**Not taken at cycle 3, and the reasons are worth keeping.** It does not solve
cycle 3's problem — all three hold money that *is* attributed, and cycle 3 is
about money that is not. It is not additive: every ledger entry ever written
references the current `account_kind` values, so it is a migration of booked
money rather than an addition beside it. And cycle 2 had just verified that
`client_collections` nets to exactly zero at every stage, which *is* the
segregation claim; splitting one account into two does not strengthen it.

**It belongs at cycle 10** — *facility escrow + client-money segregation* —
where account structure is the subject, the escrow justifies the migration, and
the daily proof exists to test it. Recorded here as a decision waiting, not an
idea lost.

## Rail costs and who bears them — routed to cycle 6 (2026-09-22)

**Decided at cycle 3's Design, after a Virtual Account Number test on the live
Circle sandbox proved that inbound attribution follows the account number the
payer sends to, not the reference they quote.**

Giving each counterparty its own VAN would make inbound payments
self-attributing. The decision taken is **VANs per supplier programme, not per
debtor**: supplier and funder bank accounts must be registered for payouts
anyway, so their VANs cost nothing extra, while a debtor is never paid and
would be registered purely for reconciliation — and debtors are the many side,
one supplier selling to many buyers.

**Who bears each cost:** the platform for its own main account, for funders
(scarce and courted) and for suppliers (free, registered already); the supplier
for any per-debtor VAN, recovered in the rate rather than charged as a line
item — the debtor is the supplier's customer and there is no commercial
relationship with them to charge against.

**Why cycle 6 owns the pricing half.** The programme note above already records
that `src/lib/pricing/` never mentions `rail`, so the claim that the settlement
rail is a *priced* decision is one the code does not make. Rail costs — VAN
fees, wire fees, correspondent-bank deductions — are the concrete case that
closes that gap, and they belong in the signed grid rather than in a per-deal
field an operator types by hand.

**One item lands in cycle 10 instead.** Using a supplier-linked account's VAN
as a *collection* account means client money crediting the platform's balance
tagged to an account record in the supplier's name. Adjacent to that cycle's
client-money segregation work, and worth confirming with advice before it is
built.

Full reasoning: `docs/product/reconciliation-ops/design.md`, Epic F.

## Cycle 10 — a fiat mechanism for segregation, found at cycle 3 (2026-09-23)

**Cycle 10 has had a claim without an implementation.** Its scope says the
escrow "generalized into demonstrable segregation of client money from platform
funds, with the daily proof beside it", and the on-chain half is clear enough —
balance on chain equals balance in the ledger. The **fiat** half had no
mechanism at all. It does now, and the evidence is recorded here so the cycle
does not start from scratch.

**What Circle actually offers.** One Circle Mint account can hold several
**wallets**, each with its own balance (`GET /v1/wallets`; balances queryable
per wallet with `?walletId=`). Circle calls them institutional subaccounts and
creates them through `POST /v1/externalEntities`. So a disbursement wallet and a
collections wallet are a real thing, not a bookkeeping convention: money wired
into a collections VAN credits the collections wallet and cannot silently fund a
disbursement.

**Proved in the sandbox on 2026-09-22/23, against the live account:**

```text
one linked bank account, two different STABLE virtual account numbers:
  GET /…/wires/fbf1313c/instructions                      CIR2NV7EX2  11001233428
  GET /…/wires/fbf1313c/instructions?walletId=1017494761  CIR32R8WXL  11001234876
  (identical on repeat calls; an unknown walletId is refused)

the entitlement gate is not closed in sandbox:
  GET  /v1/externalEntities      200  {"data":[]}   (not 403)
  POST /v1/externalEntities {}   400  field validation (not 401/403)

attribution follows the ACCOUNT NUMBER, not the quoted reference:
  sent account A's trackingRef with account B's VAN
  → Circle rewrote the trackingRef to B's and attributed the deposit to B
```

**So the wallet is the multiplier, not the bank account.** One bank account × N
wallets = N virtual account numbers. Per-supplier or per-programme collection
numbers need no counterparty bank details at all — which also removes the
objection that a debtor will not share theirs.

**But it is not available, and that is the point of writing it down.** Circle
Customer Care, 2026-09-23: *"The Circle Mint Account is available only to
businesses… please reach out to our Sales team to discuss your production
access."* Subaccounts require a negotiated commercial agreement, so this is a
**documented production path, demonstrated in sandbox — not a capability this
project can use.** Cycle 10 therefore proves segregation at the **ledger** level
and cites this mechanism as what a commercial deployment would use.

**Bankruptcy remoteness is unchanged, and must not be overclaimed.** Wallets are
operational segregation, not a legal structure. Every wallet sits under the
platform's own Circle account, and the balance is a claim on Circle that would
be an asset of the platform's estate. `PRODUCT_PAPER.md` §10 Q18 already answers
this — *"As demonstrated: no, deliberately"* — and prices the structures that do
create remoteness (designated trust/safeguarded accounts at Stage 1; a
securitisation vehicle or Series LLC at Stage 2, where the true-sale and
non-consolidation opinions cost $50–250k). **Nothing found here moves that
answer.** What wallets contribute is the *evidence* every one of those
structures depends on: proof, at any moment, of whose money is whose.

**One question left open, and it is the valuable one** if this ever goes
commercial: can an institutional subaccount wallet be **designated as a
client-money, trust or safeguarded account**, so the balance sits outside the
platform's estate? That is a legal characterisation, not an API feature, and it
is Stage 1's hinge.

Full working: `docs/product/reconciliation-ops/design.md`, Epic F.

## Deferrals are per-cycle, not omissions

Each cycle's discovery records what it deliberately does not do and where that
work lands instead — e.g. cycle 0 books settlement against labelled
demo-internal evidence (the rail is cycle 1's) and approves deals with an
unassisted ops decision (the credit machinery attaches to that same gate in
cycles 6–7). When a cycle's scope looks thin, check its discovery's deferral
notes before calling it a gap.

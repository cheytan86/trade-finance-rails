# Discovery — Foundation (cycle 0)

Date: 2026-09-06 · Verdict at Step 2: **go**, reshaped from "all four roles via
the role switch" — narrowed to *one invoice through four pairs of hands*, with
platform ops anchoring the spine.

Track: **FULL** (weight test: creates the schema · books money movements ·
builds the role mechanism · many files. No model calls — ever, per
STACK_RULES.md). Cycle 0 runs **without an allow-list** (NEW-project mode);
the boundary switches on the moment this cycle's slice is clickable, per the
trigger recorded in STACK_RULES.md.

## 1. User

A platform ops operator working one deal end to end: a submitted invoice sits
in their queue, and they review it, approve it, fund it, and disburse to the
supplier — each money step behind an explicit confirm. The other three roles
(supplier, funder, debtor) appear as the surfaces this operator's decisions
touch, reached by the demo's role switch: the supplier submits and later sees
payment, the funder sees a position, the debtor's public payment surface exists
as a stub for later cycles. Not "everyone" — one deal, four pairs of hands,
ops's hands on the gates.

## 2. Workflow

1. Supplier (via role switch) submits an invoice: debtor name, face value,
   currency, due date.
2. Platform ops sees it in a review queue, sets the terms, and approves it —
   or refuses it, with the failing rule named.
3. Ops confirms **funding**: the financing leg books as balanced ledger
   entries (funder account → deal), behind a human confirm.
4. Ops confirms **disbursement**: the disbursement leg books (deal → supplier
   payable), behind a second human confirm.
5. Switching roles: the supplier's surface shows the disbursement landed; the
   funder's surface shows the position; each role sees only its own book.
6. At every money step, an ops-facing ledger view shows the entries that
   booked — each movement summing to zero, every balance derived live as
   SUM(entries), never read from a stored column.

The spine stops at *disbursed* — exactly the boundary trigger in
STACK_RULES.md ("an invoice created, approved, funded and disbursed,
clickable, on a branch"). Repayment, payout and residual legs arrive with the
settlement rails (cycles 1–3); the exact full state machine, including
matured-unpaid and reconciliation holds, is cycle-1 design territory (PRD.md
§2). In cycle 0, settlement evidence is a **labelled demo-internal reference**
— the USDC rail replaces that evidence source in cycle 1, and the demo says so
on screen rather than implying a settlement it doesn't have.

Likewise deferred, on purpose: approval in cycle 0 is an **unassisted ops
decision** — no scorecard, no rating, no limit check behind it. The credit
machinery (policy → scorecard → rating → the three-level limits, PRD.md §5)
attaches to this same approval gate in cycles 6–7; cycle 0 lays down only its
attachment points — parties and debtors as real entities, and the ledger the
limits will later be enforced against.

## 3. Trigger

The supplier submits the invoice **live in the demo**, from a blank form —
that submission event is what puts a deal in front of ops. Nothing on the
spine is pre-staged. Seed data exists only as backdrop: a seed script
producing invoices in other states so queues and lists render honestly rather
than fake-empty.

## 4. Current process (in the app today)

Nothing. Audited at Step 0 this session, not assumed: 0 pages, 0 API routes,
no package.json, no migrations directory, 0 commits
(discovery-kit/YOUR_PRODUCT.md, corrected in place 2026-09-06). The intended
process exists only as prose in PRODUCT_PAPER.md §7.

The predecessor product performs a version of this workflow in the sibling
repo `receivables-financing-mvp`, and three of its modules are the ones worth
copying — read this session, with their condition noted:

- `src/lib/web3/verify.ts:30-84` — re-derives a transfer from the chain
  instead of trusting the client. The asset. Three defects must not travel:
  the chain is hard-coded from `wagmi/chains` (line 6, while
  `NEXT_PUBLIC_CHAIN_ID` is declared and never read), only the *first* log
  matching the token address is checked (line 51), and amounts pass through
  float `toFixed` (line 68).
- `src/lib/pricing.ts:56-106` — pure act/360 tenor pricing with a snapshot
  locked at financing so a shrinking tenor cannot move a funded deal. It has
  no tests, and it computes in floats (`round2`); the copy converts to integer
  minor units and gains the tests it never had.
- `src/lib/api-helpers.ts:50-85` — `recordTransactionOnce` (tx-reference
  idempotency) and `maybeCompleteInvoice` (order-independent completion that
  re-reads the table rather than trusting a flag). Lines 9–43 of the same
  file — the platform treasury resolved as "whichever admin row comes back
  first" — stay behind; the new repo gets a real accounts concept.

That sibling can never be this demo: its proxy runs authentication on
essentially every request, so it cannot boot without a live Supabase project.

## 5. Pain / gap

The product does not exist, and every later cycle — rails, reconciliation,
credit, verification, escrow — attaches to what this cycle creates: the
schema-in-migrations, the double-entry core, the role switch, the deploy
pipeline, the gate commands. The cost of the gap is total: nothing can be
demonstrated, nothing can be evaluated, and STACK_RULES.md's gate section
honestly reads "NO TEST SUITE. NO BUILD." Secondary pain, inherited: the
sibling repo's known defects (floats in money paths, treasury-by-role-lookup,
base schema applied outside version control) are published mistakes waiting to
be re-made unless cycle 0 explicitly builds their corrections.

## 6. Opportunity

Cycle 0 delivers the foundation: Next.js + Tailwind scaffold with versions
pinned; Postgres (Neon) + Drizzle with **every table in a migration from the
first commit**; the double-entry ledger core (settlement_events +
ledger_entries, balanced, balances always derived); money as integers in minor
units; the four-role switch with no sign-in; the three copied modules,
corrected and tested; the gate commands (tsc · lint · test · build) recorded
in STACK_RULES.md with real numbers; the deploy pipeline; and the demo slice
in rows 1–2.

**Agent or product: all PRODUCT work.** Forms, state, a ledger, views. No step
exercises judgment over documents, rules or context that a deterministic rule
cannot express — approval is a human's decision, booking is arithmetic, and
STACK_RULES.md decides this project calls no model API. Recorded as the
initial read; Design tests it product-first, and nothing here argues for an
agent.

## 7. Data plan

**Real tables: none exist** — the first migrations create them; that is the
deliverable, not a dependency. The entities the workflow needs, named at
Discovery level only (columns and constraints are Design's to write): parties
and their roles · invoices · accounts (per role/currency, including platform
treasury — a real concept, not a profile lookup) · settlement_events (what
happened, with its evidence reference) · ledger_entries (what it means,
balanced, referencing the event).

**Synthetic fixtures:** a seed script producing the four role identities,
synthetic suppliers, debtors and a funder, and invoices across the spine's
states as backdrop for queues and lists. All amounts integers in minor units.
Everything synthetic — no real company, no real person, no registry data
(the registry-never-stored rule from PRODUCT_PAPER.md §10 has nothing to bite
on yet, and cycle 0 keeps it that way). Fixture conventions per
SYNTHETIC_DATA_STARTER.md.

## 8. Human boundary

Never without a person on screen: funding, disbursement, and any state
advance — each behind an explicit ops confirm (STACK_RULES.md high-stakes
surfaces, [DECIDED]). The browser posts **decisions, never results** — a
client claim about what happened is a hint about where to look, not evidence.

Never at all: mainnet, custody, real counterparties, or real money — testnets
and labelled demo-internal evidence only; a model API call; a stored balance
column; a hand-edit that bypasses the ledger invariant (a correction is a new
balanced entry pair, never a mutation); a secret that can cost money on any
deployed surface; editing an applied migration after the fact.

## 9. Success metric

Measurable in the demo or the test suite, not a wish:

1. The spine completes on screen: submitted → approved → funded → disbursed,
   live, with the supplier's surface showing payment.
2. An attempt to book an unbalanced movement is **refused**; every accepted
   movement's entries sum to zero — asserted by test.
3. No stored balance exists in the schema; every rendered balance equals
   SUM(entries) — asserted by test; a fractional-float amount is rejected at
   the boundary.
4. Booking the same movement twice (same idempotency key) books exactly once;
   disbursing an unfunded invoice is refused **with the failing rule named**.
5. Role isolation holds: supplier A never sees supplier B's invoice; the
   funder sees positions, not the supplier's book — asserted per role.

Plus the process metric: STACK_RULES.md's gate section is rewritten from "NO
TEST SUITE. NO BUILD." to the four real gate commands with real counts — the
foundation exists when that block can no longer be written honestly.

## 10. Demo idea

The demo will show [a supplier submitting an invoice from a blank form] → [ops
reviewing it against the terms and approving — or refusing with the rule
named] → [ops confirming funding, then disbursement, each behind its own
human gate] → [the ledger view showing every movement as balanced entries,
balances derived live, evidence labelled demo-internal until the USDC rail
lands in cycle 1] → [the role switch proving the supplier sees payment, the
funder sees a position, and each role sees only its own book] — on screens
whose routes Design will name: a role switch, a supplier submission form, an
ops review queue, an ops ledger view, and per-role deal views.

---

*Why this cycle (grill Q10, recorded): sequencing first — nothing else can
exist until this does; ledger-learning second — the double-entry core is the
part of trade-finance infrastructure most worth understanding by building,
which is why it gets full care rather than a copied shortcut.*

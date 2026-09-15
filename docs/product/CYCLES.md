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
| 3 | **Reconciliation ops** | FULL | 2 | The five exceptions incl. failed screening, reversals, exception aging. **Mode 1 (all-fiat) completes here**; mode 2 (hybrid) now completes at cycle 6 with the programme. |
| 4 | **Priced rail comparison v1** | likely LIGHT | 1–3 | **The headline, pulled forward** — one invoice, three rails, cost/speed/risk side by side. Needs only cycles 1–3, so the project's core claim exists by roughly week 7 even if everything after slips. Extends when the third rail lands (11). |
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

## Deferrals are per-cycle, not omissions

Each cycle's discovery records what it deliberately does not do and where that
work lands instead — e.g. cycle 0 books settlement against labelled
demo-internal evidence (the rail is cycle 1's) and approves deals with an
unassisted ops decision (the credit machinery attaches to that same gate in
cycles 6–7). When a cycle's scope looks thin, check its discovery's deferral
notes before calling it a gap.

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
| 2 | **Fiat rail — Circle sandbox** | FULL | 1 | Async settlement, webhook signatures, idempotency, out-of-order delivery. First step: fund the sandbox balance and register a test bank account (recorded in STACK_RULES.md so it isn't a mid-cycle surprise). |
| 3 | **Reconciliation ops** | FULL | 2 | The five exceptions incl. failed screening, reversals, exception aging. Modes 1 (all-fiat) and 2 (hybrid) complete here. |
| 4 | **Priced rail comparison v1** | likely LIGHT | 1–3 | **The headline, pulled forward** — one invoice, three rails, cost/speed/risk side by side. Needs only cycles 1–3, so the project's core claim exists by roughly week 7 even if everything after slips. Extends when the third rail lands (11). |
| 4a | **Accounts mode** — real sign-in behind the `getIdentity()` seam, user↔party binding, onboarding; `AUTH_MODE` switch, second (login-gated) deployment | FULL | 0, 4 | *Added 2026-09-06 at Chetan's direction.* One codebase, two deployments — never two repos. Slotted after the headline so the job-search asset is never delayed by auth work. Adds ~3 weeks plus a both-modes test surcharge on every later cycle — accepted knowingly. |
| 5 | **Funding models** — on-demand + committed facility, positions in the ledger | FULL | 1 | Undrawn carry displayed — instant funding costs the funder carry, and the product shows it rather than pretending it's free. |
| 6 | **Credit assessment** — written policy, deterministic scorecard (every score cites its rule), rating, real registry lookup (never scored) | FULL | 1 | The KYC method applied to a third domain — the portfolio's thesis. Calibration disclaimed wherever scores render. |
| 7 | **Limits & portfolio** — supplier facility · supplier×buyer sub-limit + concentration rule · platform debtor limit; watchlist, DPD | FULL | 5, 6 | Limits enforce against ledger positions (5) using ratings (6). Refusal names which level binds and shows its arithmetic. |
| 8 | **Invoice verification** — assurance tiers wired to eligibility/advance rate, T3 confirm link, DCSA shipment adapter, on-chain attestation | FULL | 1, 3, 6 | Tiers price evidence; insurers care about tier, so it lands before insurance. Carrier sandbox attempted, labelled mock fallback. |
| 9 | **Insured variant** — Allianz Trade sandbox / labelled mock, premium pass-through, claim = ledger evidence pack | FULL | 6, 8 | Carrier limit sits beside ours; a missed declaration window voids cover the way it does in reality. |
| 10 | **Facility escrow contract** — drawdown gated on attested tier ≥ mandate | FULL | 5, 8 | Foundry enters. Proved by refusal: unattested can't draw, T1 can't satisfy a T2 mandate. On-chain balance == ledger balance. |
| 11 | **Multi-token + Visa adapter** — mock Open USD ERC-20, VSP adapter (designed-for, mock — no public API), comparison extends to the third rail | FULL | 1, 4 | Forces chain identity to be explicit per transaction; completes the headline. The mock must say it's a mock wherever it renders. |

## The droppable tail

**Cycles 9–11 are the droppable tail.** If the ~18 weeks of evenings run out,
the project still stands at cycle 8: three settlement modes, the priced
comparison, both funding models, the full credit layer, and verification
tiers. Cycles 6–8 are *not* droppable — credit, limits and verification were
each an explicit scope decision (2026-09-05/06), chosen knowing their cost.

## Deferrals are per-cycle, not omissions

Each cycle's discovery records what it deliberately does not do and where that
work lands instead — e.g. cycle 0 books settlement against labelled
demo-internal evidence (the rail is cycle 1's) and approves deals with an
unassisted ops decision (the credit machinery attaches to that same gate in
cycles 6–7). When a cycle's scope looks thin, check its discovery's deferral
notes before calling it a gap.

# Trade Finance Rails — PRD

**v0.4 · September 2026 · progressive by design**

> **Relationship to the programme paper.** `PRODUCT_PAPER.md` is the parent: the
> argument, market, mechanics, risk framework and economics live there and are
> not repeated here. This document is the build-facing subset — actors, flows,
> scope and acceptance — and it grows: each cycle's `docs/product/<slug>/`
> discovery and design fold in as they are produced. **v0 deliberately contains
> no screens and no schemas**; writing them here would pre-empt the Design
> phase, which the process forbids. The PRD reaches v1 when the last cycle
> ships.

---

## 1. Actors

| Actor | Who | Authenticated? |
|---|---|---|
| **Supplier** | SME being financed; submits invoices, receives disbursement and residual | Role-switch (no sign-in, by design) |
| **Funder** | Provides capital — per-deal, or via a committed facility | Role-switch |
| **Platform ops** | Reviews deals, sets/accepts pricing, runs reconciliation, approves every money movement | Role-switch |
| **Debtor** | Pays the invoice at maturity; **outside the platform's control** | Public payment surface, no auth — as a payment link is in reality |

External systems, never actors: Circle (fiat rail + mint/redeem), the chain
(Base Sepolia), a company registry (real lookups, never scored), a credit
insurance carrier (sandbox or labelled mock), a shipping carrier via the DCSA
Track & Trace standard (sandbox attempted, labelled mock fallback), an on-chain
attestation service (EAS or EIP-712), the Visa Stablecoin Platform (designed-for
adapter, mock).

> **Diagrams:** `docs/flow-plates.html` — three process plates (lifecycle with
> refusal gates · the five-leg money map by mode · assurance tiers). The title
> block states which paper/PRD version they were drawn against; if that drifts
> from the versions above, the plates are stale before they are wrong.

## 2. The deal and its legs

States: `submitted → eligible → assessed → approved → funded → disbursed →
(matured-unpaid?) → repaid → settled`, plus `refused` (with the failing rule
named) and reconciliation holds. Exact machine is cycle-1 design territory.

Money legs (paper §5–§7): financing · disbursement · repayment · payout ·
residual, plus the conversion legs 2a/3a in hybrid mode. Priority of payments:
funder principal first, supplier residual absorbs shortfall. Premium and fees
are pass-through lines, never margin. Late repayment accrues **overdue
interest** (+2% on both sides of the spread, on principal, act/360; the
platform keeps the difference; the bearer is a programme parameter —
supplier-residual in cycle 1, debtor-pays defined for later).

## 3. The three modes

Per-deal configuration, not builds: **all-fiat · hybrid · all-stablecoin**. One
verification interface across rails; the state machine cannot tell rails apart.

## 4. Funding models

**On-demand** (funder acts per deal) and **committed facility** (auto-drawdown;
undrawn carry displayed; escrow contract in the droppable tail).

## 5. Credit layer *(scope added 2026-09-05)*

Written credit policy → deterministic scorecard (every score cites its rule) →
rating → **three-level limits** (supplier facility · supplier×buyer sub-limit
with a concentration rule · platform-wide debtor limit — all enforced against
the ledger; a refusal names which level binds and shows its arithmetic) →
**grid band** (rate by the buyer's rating band × tenor, agreed in the
supplier's RPA and applied per invoice without discretion; one supplier with
three buyers sees three fixed rates) → portfolio view (concentration,
watchlist, DPD feedback). Synthetic
files scored; registry lookups real and **never** scored. Calibration
disclaimed wherever scores render.

## 6. Invoice verification *(scope added 2026-09-06)*

Assurance tiers as a priced deal attribute, derived from recorded attestations
— never set by hand. T0 self-declared → T1 source-pulled → T2 shipment-verified
(DCSA-standard B/L matching; deterministic rules; one B/L never behind two
financed invoices) → T3 debtor-confirmed (single-use tokenised link on the
public payment surface; no buyer accounts). Tier feeds **eligibility and
advance rate** via the RPA's tier schedule — the rate comes from the grid, and
a supplier's rate never varies deal to deal. At funding the tier is attested
on-chain (platform-signed:
tamper-evident, not independently true); the facility escrow refuses drawdowns
below the funder's mandated tier. Residuals stated: collusion, services
invoices, cross-lender doubles without a market registry.

## 7. Insured variant

Carrier limit check at assessment · cover bound at funding · premium as
pass-through pricing line · policy conditions tracked as dates · claim files
with the ledger evidence pack · proceeds through the waterfall. Allianz Trade
sandbox attempted; labelled mock otherwise.

## 8. Reconciliation

Five exceptions, each refusing to advance and stating what is known: unmatched
reference · part payment · overpayment · ambiguous match · failed screening.
Plus post-settlement reversals: a reversal pair is booked, the invoice
regresses, the event log never deletes. One matching engine, two kinds of
evidence (statement line / tx hash).

## 9. Non-goals

Collusion defence and cross-lender registry (fraud is narrowed by tier, never
eliminated) · real money or custody · multi-currency FX · collections and
dunning · legal/accounting opinions (paper §10 is questions only) · live Visa
integration · audited contracts · production of any kind. Full list: paper §12.

## 10. Acceptance

The nine judgement criteria in paper §12 are the product-level acceptance
tests, written before building so the result can be held against them. Per-cycle
acceptance lands in each cycle's `design.md`.

## 11. Cycle index — filled as cycles complete

> Why this order, what each cycle needs, and which cycles are droppable:
> `docs/product/CYCLES.md`. This table is the live tracker; that file is the
> rationale.

| Cycle | Slug | Discovery | Design | Shipped |
|---|---|---|---|---|
| 0 foundation | `foundation` | ✅ 2026-09-06 | ✅ 2026-09-06 | ⬜ |
| 1 settlement seam + USDC | `settlement-usdc` | ✅ 2026-09-07 | ✅ 2026-09-07 | ⬜ |
| 2 fiat rail (Circle) | — | ⬜ | ⬜ | ⬜ |
| 3 reconciliation | — | ⬜ | ⬜ | ⬜ |
| 4 priced comparison v1 | — | ⬜ | ⬜ | ⬜ |
| 4a accounts mode *(added 2026-09-06)* | — | ⬜ | ⬜ | ⬜ |
| 5 funding models | — | ⬜ | ⬜ | ⬜ |
| 6 credit assessment | — | ⬜ | ⬜ | ⬜ |
| 7 limits & portfolio | — | ⬜ | ⬜ | ⬜ |
| 8 invoice verification | — | ⬜ | ⬜ | ⬜ |
| 9 insured variant | — | ⬜ | ⬜ | ⬜ |
| 10 facility escrow | — | ⬜ | ⬜ | ⬜ |
| 11 multi-token + Visa | — | ⬜ | ⬜ | ⬜ |

## Change log

- **v0.4** (2026-09-07) — overdue interest added at Chetan's direction during
  cycle 1's design: supplier rate +2% charged / funder rate +2% received on
  principal act/360, platform keeps the spread, borne by the supplier's
  residual (bearer is a programme parameter). Supersedes the paper's v5–v8
  "unremunerated overdue" simplification; paper → v9.

- **v0.3** (2026-09-06) — per-buyer pricing made explicit (the predictability
  promise is per supplier × buyer × tenor band) and the limit hierarchy added
  at Chetan's direction: facility limit, supplier×buyer sub-limit with
  concentration rule, platform debtor limit. Paper v8 carries the same change.
- **v0.2** (2026-09-06) — pricing corrected to the RPA grid model at Chetan's
  challenge: rate fixed by rating band × tenor in the signed RPA; verification
  tier moves eligibility and advance rate, never the rate; per-invoice
  application is deterministic. Paper v7 carries the same change.
- **v0.1** (2026-09-06) — invoice verification added (§6): assurance tiers,
  T3 confirm link, DCSA shipment matching, on-chain attestation, escrow tier
  gate. Reversals added to reconciliation. Non-goals narrowed from "fraud
  controls" to the stated residuals. Criteria 8 → 9.
- **v0** (2026-09-05) — scope, actors, legs, modes, non-goals, acceptance
  pointers. Credit layer and insured variant included per the 2026-09-05
  decisions.

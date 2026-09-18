# Trade Finance Rails — PRD

**v0.6 · September 2026 · progressive by design**

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

States, as built in cycle 1 — nine, with one two-way edge:

```text
submitted → approved → priced → funded → disbursed → repaid → settled
    ↕ returned (ops returns with a note; the supplier corrects and resubmits)
    → refused (terminal, the failing rule named)
```

The ops pipeline is three stages: **trade validation** (the invoice shown as
a document; approve · return for corrections · reject) → **pricing** (the rate
card and its full result; funding requires a priced deal) → **settlement**
(the five money gates). Cycle 7's limit check slots in beside pricing.
Overdue-ness is a display condition off the due date, not a state.
Reconciliation holds and reversals arrive with cycle 3.

**[cycle 2] Settlement is asynchronous, and the state machine did not change
to absorb it.** On the fiat rail a gate INITIATES a movement and Circle
confirms it later. Between those two moments the money has left, nothing is
booked, and the deal has not advanced — being in flight is a display
condition, exactly as overdue-ness is, and `src/lib/domain/states.ts` stayed
byte-identical through the cycle to prove it. Balances are unchanged while a
leg is in flight: **in-flight money is not money.** A leg is finished by a
signed webhook from Circle or by an operator pressing Check status; both run
the same booking path, which re-reads the rail's own record and never believes
what it was told. Two limits this leaves open, both cycle 3's: an inbound
payment is recognised by amount and arrival rather than by an id, so two
identical amounts in flight together are a named refusal; and the repayment
date recorded is the moment of confirmation, not of payment.

Money legs (paper §5–§7): financing · disbursement · repayment · payout ·
residual, plus the conversion legs 2a/3a in hybrid mode. Priority of payments:
funder principal first, supplier residual absorbs shortfall. Premium and fees
are pass-through lines, never margin. Late repayment accrues **overdue
interest** (+2% on both sides of the spread, on principal, act/360; the
platform keeps the difference; the bearer is a programme parameter —
supplier-residual in cycle 1, debtor-pays defined for later).

## 3. The three modes

**all-fiat · hybrid · all-stablecoin.** One verification interface across
rails; the state machine cannot tell rails apart.

*Corrected 2026-09-15:* these are **programme configuration, not per-deal
configuration**. Until cycle 6 builds the programme, the rail is a per-deal
field chosen by ops on the pricing form — scaffolding, and the reason hybrid
cannot be expressed before then: it is two rails inside one deal, and
`invoices.rail` is one column. See `docs/product/CYCLES.md`, "The programme".

## 4. Funding models

**On-demand** (funder acts per deal) and **committed facility** (auto-drawdown;
undrawn carry displayed; escrow contract in the droppable tail).

## 5. Credit layer + the programme *(credit added 2026-09-05; the programme 2026-09-15)*

**The programme is the supplier × buyer agreement, signed as an RPA**, and it
is where the head terms live: the grid, the tier schedule, and — new, at
Chetan's direction 2026-09-15 — the **settlement arrangement**, naming which
rail settles which leg. **Pricing applies it read-only**; ops overrules only
with a recorded reason. Consequences: the rail stops being a per-deal choice
(a supplier's RPA names the account they are paid into — nobody picks a rail
per invoice); **hybrid becomes a programme type rather than a toggle**; and
per-leg rails fall out with no per-deal schema. Built in cycle 6.


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
| 2 fiat rail (Circle) | `circle-fiat` | ✅ 2026-09-15 | ✅ 2026-09-15 | ⬜ |
| 3 reconciliation | — | ⬜ | ⬜ | ⬜ |
| 4 priced comparison v1 | — | ⬜ | ⬜ | ⬜ |
| 4a accounts mode *(added 2026-09-06)* | — | ⬜ | ⬜ | ⬜ |
| 5 funding models | — | ⬜ | ⬜ | ⬜ |
| 6 credit assessment + the programme | — | ⬜ | ⬜ | ⬜ |
| 7 limits & portfolio | — | ⬜ | ⬜ | ⬜ |
| 8 invoice verification | — | ⬜ | ⬜ | ⬜ |
| 9 insured variant | — | ⬜ | ⬜ | ⬜ |
| 10 custody: escrow + segregation | — | ⬜ | ⬜ | ⬜ |
| 11 multi-token + Visa | — | ⬜ | ⬜ | ⬜ |

## Change log

- **v0.7** (2026-09-15) — **the programme**, at Chetan's direction, from a
  question asked while reviewing cycle 2's screen mockups: *why does pricing
  have an option for settlement rail?* Checking found that `src/lib/pricing/`
  never reads `rail` — the picker affected no number — and that one
  `invoices.rail` column cannot express hybrid, which is two rails in one
  deal. Resolution: the supplier × buyer RPA carries the grid, the tier
  schedule **and the settlement arrangement**, and pricing applies it
  read-only. Cycle 6 renamed "credit assessment + the programme" and extended
  to build it; **hybrid moves from cycle 2/3 to cycle 6** as a programme type;
  cycle 2 is async-only. Rationale in `docs/product/CYCLES.md`, "The
  programme". Paper → v11.

- **v0.6** (2026-09-09) — cycle 1's built reality folded in: the nine-state
  machine with `returned` and `priced`, and the three-stage ops pipeline
  (trade validation → pricing → settlement). Three Develop-time scope
  additions at Chetan's direction, each recorded in
  `docs/product/settlement-usdc/design.md`: invoice document fields, the
  pricing step with its three indicators, and trade validation's three
  outcomes.

- **v0.5** (2026-09-07) — custody made explicit at Chetan's challenge: paper
  §10 gains Q18 (bankruptcy-remoteness — the demo deliberately isn't; the
  staged real-world structures priced, humans included; paper → v10). Cycle
  10 extended into the custody cycle (escrow + client-money segregation);
  standing design rule from cycle 2: client money never shares an account or
  wallet with platform funds (docs/product/CYCLES.md).

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

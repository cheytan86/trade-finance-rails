# Trade Finance Rails — Programme Paper

**Multi-rail settlement for receivables financing**
Chetan Malhotra · September 2026 · v9 draft

> **What this document is.** A programme paper: the parent document for this
> project. It carries the argument, the market, the mechanics, the risk framework
> and the economics. The PRD is its build-facing subset — actors, the five legs,
> the three modes, scope and success criteria — and does not repeat what is here.
>
> **What it is not.** A prospectus. Nothing described here has a legal entity, a
> counterparty or a licence, and §10 and §12 say so at length rather than in a
> footnote.

---

## 1. Executive summary

A supplier ships in March and is paid in May. Receivables financing closes that
gap — a funder advances most of the invoice now and collects the full amount at
maturity. Unmet demand for it is **$2.5 trillion, about 10% of global trade**,
and it has not moved since 2023.

That gap is mostly a **credit** problem. This programme underwrites **by rule**
— a written credit policy and a transparent scorecard whose every score cites
the rule it rests on, with the honest caveat that its calibration is invented
(§7, §12). Its deeper subject is the part of the cost nobody owns at all:
**settlement**.

A receivables deal is not one payment but **five**, and each can settle on a
different rail — bank transfer, or stablecoin — with materially different cost,
speed, failure modes and reversibility. In practice that choice is made once,
early, by whoever wired up the first payment integration, and never revisited. It
appears on no rate card and in no credit paper.

**The thesis: the settlement rail is a commercial decision currently made as a
technical default, and a financing platform should price it, expose it, and let
it differ per leg.**

The programme demonstrates this by running one invoice through three settlement
modes — all-fiat, hybrid, all-stablecoin — over a real fiat sandbox and a real
testnet, with a double-entry ledger underneath and a reconciliation surface that
refuses to advance an invoice it cannot match. It builds both funding models,
on-demand and committed facility, because the difference between them is where
the interesting cost sits.

**It is a demonstration, not a business.** No entity, no licence, no real money,
no counterparties. §12 states what that rules out.

---

## 2. Problem and market

### The gap

The Asian Development Bank's *Global Trade Finance Gap Survey*, published
**15 January 2026** from more than 110 trade finance providers, puts unmet demand
at **$2.5 trillion — roughly 10% of global trade**, unchanged since 2023. SMEs
still see **41% of requests rejected**, against 40% for large corporates.

### Why it persists, and which part this touches

| Cause | Share of the problem | Addressed here |
|---|---|---|
| **Credit** — the obligor cannot be assessed, or fails assessment | Most of it | **By rule** — a written policy and a transparent scorecard on synthetic data (§7). Its calibration is unvalidatable, and §12 says so |
| **Compliance cost** — KYC, sanctions, onboarding | Significant | Onboarding KYC sits with a sibling project. Per-payment screening appears *here* — as a cost line in §9 and a reconciliation exception in §7. |
| **Operating cost** — origination, settlement, reconciliation, exceptions | The remainder | **This is the part** |

Saying this plainly matters. A paper implying that stablecoin settlement closes a
$2.5tn *credit* gap would make a claim its own evidence cannot support, and an
informed reader would stop there.

### Where settlement cost hides

Not in the wire fee. In four places that rarely reach a rate card:

- **Days of float** — capital committed but not yet working, at both ends.
- **Reconciliation labour** — someone matching statement lines to invoices, and
  chasing the ones that do not match.
- **Exception handling** — a part payment, an overpayment, a wrong reference;
  each a manual investigation.
- **Certainty of settlement** — how long before money is irreversibly yours, and
  what a late reversal costs.

---

## 3. Target market and client profile

### The supplier — the party being financed

- SME exporter or manufacturer, roughly **$2m–$20m turnover**
- Sells to substantially larger buyers on **30–90 day terms it did not choose**
- Working capital is the binding constraint, not profitability
- Typically under-served by banks — too small for structured trade finance,
  insufficient collateral for an overdraft
- **Buys speed and certainty, not basis points.** The most important thing to
  understand about them: they will accept a materially worse rate for money that
  arrives today rather than next week.

### The funder — the party providing capital

Three sub-profiles, and the rail matters differently to each:

| Profile | Motivation | Rail preference |
|---|---|---|
| **Private credit fund** | Short-duration, self-liquidating yield | Fiat; regulated custody is a mandate constraint — and many mandates require debtor risk to be insured or investment grade (§7) |
| **Family office / HNW** | Diversification, real-economy exposure | Indifferent; follows the platform |
| **Crypto-native treasury** | Yield on stablecoin holdings without leaving stablecoins | Stablecoin; off-ramping is friction and cost |

**The third profile is why this product exists.** A treasury holding stablecoins
that wants short-duration real-economy yield must currently off-ramp, wire and
wait — which destroys much of the advantage. §5 shows this demand is no longer
hypothetical.

### The debtor — the party who owes

- The supplier's customer; a **mid-to-large corporate** with its own treasury
  policy and payables cycle
- **No relationship with the financier and no reason to accommodate it**
- Pays on its own terms, its own rail, its own remittance conventions

This constraint shapes the whole programme. §6 returns to it.

---

## 4. Value proposition

**To the supplier.** Cash in minutes rather than days, with the price of that
speed stated rather than buried. Under a committed facility the wait becomes
mechanical rather than human — no funder has to be awake.

**To the funder.** Short-duration yield on capital that never leaves the token it
started in, if that is what they want; and a per-deal view of what settlement is
actually costing them, which no incumbent shows.

**To the platform.** Margin on the spread between what the supplier pays and what
the funder receives, plus a defensible reason to exist: routing settlement well
is a service, and nobody currently sells it.

**The honest counter-argument**, stated because it will be raised: for most
suppliers, settlement cost is small beside the discount rate. True. The claim is
not that settlement dominates the economics — it is that it is *the part nobody
has priced*, and unpriced costs are where margin hides.

---

## 5. The landscape — who serves this today

Three groups already occupy adjacent ground, and one collapse is instructive.
Naming them matters: the first question an informed reader asks is *"how is this
different from Centrifuge?"*, and a paper that has not pre-empted it looks like
it has not heard of it.

### The incumbents

**C2FO, Taulia, PrimeRevenue** and their peers run supply-chain finance and
receivables programmes at global scale. They are good at what this paper calls
the credit and origination problem. All of them are **all-fiat, and the rail is
invisible** — settlement is plumbing beneath the product, priced nowhere,
chosen by nobody. That is not a criticism; it is the default this programme
argues against.

### On-chain private credit — the funder wedge, already proven

The demand this programme's §11 wedge describes is no longer a hypothesis.
On-chain private credit held roughly **$8 billion in active TVL by mid-2026**,
with more than $14 billion in cumulative originations:

- **Centrifuge** — tokenises invoices and trade-finance receivables into pooled,
  tranched structures; about **$1.6B TVL**, with invoice and trade-finance pools
  above $400M.
- **Maple** — institutional lending pools, deposits past **$4B** in 2026,
  yields typically 7–8%.
- **Huma** — receivables and payment-flow financing denominated in stablecoins.

**What none of them does is this programme's subject.** They tokenise the
*asset* — the receivable becomes a pool token, and the funder buys exposure to a
structure. The settlement of the underlying legs stays as invisible as it is at
the incumbents. No one prices the rail per leg, no one exposes the choice, and
the supplier-side experience — time-to-cash, reconciliation, exceptions — is not
their product. They are evidence the capital exists, not competitors for the
argument.

### The cautionary tale — Stenn

**Stenn**, a UK invoice-financing platform once valued at $900M, entered
administration on **4 December 2024** owing creditors around **$1bn**, after
HSBC identified over **$220M of questionable invoices** — receivables
purportedly owed by blue-chip Japanese and Taiwanese companies that, when asked,
denied any relationship with Stenn's clients.

Two lessons shaped this paper. First: **Stenn funded claims attested by nobody
but the seller.** The invoices were documents the supplier produced; the
blue-chip debtors, when finally asked, denied everything. That observation is
the seed of §7's verification tiers — fraud, in evidence terms, is a claim
resting on the supplier's word alone, and the defence is counting independent
attestors, then pricing what you count. Second: Stenn's fraud eventually
surfaced *in the money flow* — repayments arriving from lookalike entities with
no connection to the named debtors. An architecture in which every settlement
event carries independently verifiable proof is the right direction of travel;
what the tiers narrow and what they cannot close (§8) must stay sharp.

---

## 6. The settlement thesis

### Five legs, not one payment

| # | Leg | From → to | Who chooses the rail |
|---|---|---|---|
| 1 | **Financing** | Funder → platform | The funder |
| 2 | **Disbursement** | Platform → supplier | The platform |
| 3 | **Repayment** | Debtor → platform | **Nobody the platform controls** |
| 4 | **Payout** | Platform → funder | The platform |
| 5 | **Residual** | Platform → supplier | The platform |

### The constraint that shapes everything

**The platform controls four of the five legs. Leg 3 belongs to the debtor** — a
third party with its own bank, its own policy, and no contractual reason to
change either.

Every design assuming an all-stablecoin flow quietly assumes the debtor plays
along. Most will not. That single fact:

- makes **hybrid the realistic mode**, not a waypoint to a pure one
- makes **reconciliation unavoidable**, because leg 3 arrives as a bank credit
  with a reference someone typed
- makes **the ledger the centre of the product**, because incoming money must be
  held somewhere before it is matched

### What differs between rails

| | Bank transfer | Stablecoin |
|---|---|---|
| Settlement time | Hours to days | Seconds |
| Finality | Reversible for a period | Final at confirmation |
| Cost | Fixed fee + FX spread | Gas; near-zero on an L2 |
| Proof | A statement line and a reference | A transaction hash, independently verifiable |
| Failure mode | Wrong reference, part payment, return | Wrong chain, wrong token, insufficient gas |
| Counterparty risk | The bank | The token issuer, and the chain |

**Neither column is better.** They are different instruments, and which suits a
leg depends on who is on the other end. That is the product.

### The three modes

**Mode 1 — all fiat.** What almost every platform runs. The baseline; without it
there is nothing to compare against, and a comparison against a strawman proves
nothing.

**Mode 2 — hybrid.** Funder capital in and out in stablecoin; supplier paid in
fiat; debtor pays as it pleases. **This is the answer for the foreseeable
future**, not a compromise — a funder may be crypto-native while the supplier's
payroll, tax and materials are denominated in fiat and always will be.

Hybrid has a consequence the pure modes hide: **it makes the platform the
converter**. §7 names those hidden legs explicitly.

**Mode 3 — all stablecoin.** Fastest and cheapest on every leg, with a
precondition the platform cannot compel. Genuine applicability is narrow:
intra-group settlement, crypto-native counterparties, corridors where the fiat
rails are genuinely bad.

### Why now

**Visa launched the Visa Stablecoin Platform in July 2026** — an enterprise
environment for banks and fintechs to mint, hold, transfer and redeem stablecoins
inside existing treasury workflows, with **Open USD as its first supported
token** alongside USDC and USDG, across nine settlement blockchains. When the
largest card network builds a console whose purpose is *choosing tokens and rails
per flow*, the thesis stops being one that needs arguing.

---

## 7. Programme mechanics and flows

### Eligibility — the gate before any deal

Two questions live here, and blurring them is how platforms end up doing
underwriting without admitting it:

**Who may be financed** is answered by rules, not judgement:

- identity and compliance — the supplier's KYC is approved (the onboarding
  problem, owned by a sibling project and consumed here as a gate)
- incorporated in an allowlisted jurisdiction
- invoices denominated in USD (§7, currency scope)
- tenor between 30 and 90 days; face value within stated bounds
- the debtor is a corporate, not an individual — a rule that is load-bearing
  for the regulatory perimeter (§10, Q6): financing owed by consumers is a
  different and heavier regime, and this rule is what keeps the programme out
  of it

Deterministic on purpose: the same input always gets the same answer, the rules
are testable, and an ineligible invoice is **refused with the failing rule
named** — the same refuse-and-state pattern the reconciliation surface uses.

**Whether this deal is good** is a different question — underwriting — and it
gets its own machinery below, rather than hiding inside the review step.

### Credit assessment — whether the deal is good

*Brought into scope 2026-09-05, at the author's decision and cost: originally
this paper made "we do not underwrite" a feature of its honesty. The framing
that survives the change is underwriting **by rule** — the same method the
sibling KYC project applies to compliance, applied to credit.*

- **A written credit policy** is the source of truth: what makes a debtor
  acceptable, what drives a limit, what moves a price. Rules with identifiers,
  like the KYC policy pack.
- **A deterministic scorecard** implements it. Inputs: debtor financials,
  payment history, country, sector. Output: an internal rating — **every score
  citing the policy rule it rests on**. No model, no machine learning; the same
  debtor file always gets the same rating, and a score with no rule behind it
  is a bug.
- **Whose credit sets what.** The buyer's rating prices the invoice — band ×
  tenor on the grid — and sizes the buyer's sub-limit. The supplier's standing
  sizes the programme: facility limit, advance-rate schedule, service fee, and
  (question 8 of §10) the recourse basis. Both creditworthinesses price; in
  different places.
- **Rating drives limits, in a three-level hierarchy** — every invoice must
  clear all three, each measured against the ledger, never a cached number:
  the supplier's **facility limit** (RPA head terms); the **supplier × buyer
  sub-limit**, set from the buyer's rating plus a concentration rule — no
  buyer above a stated share of the facility, because a programme that is 90%
  one buyer is a disguised single-debtor bet; and the **platform-wide debtor
  limit** across all suppliers. A breach at any level refuses the deal showing
  **which limit binds and its arithmetic** — headroom on all three, and the
  one that said no. Under the insured variant the effective sub-limit is
  min(internal limit, carrier's limit on that buyer).
- **Rating selects the grid band.** Pricing is a grid — rate by debtor rating
  band and tenor band — agreed in the RPA at assessment (§10, Q16) and applied
  per invoice without discretion. The reviewer sees the band and the rule that
  selected it; nobody types a rate.
- **A portfolio view** reads the same data upward: concentration by debtor,
  sector and country; a watchlist; days-past-due history feeding back into
  ratings.
- **Two kinds of data, never mixed.** Synthetic debtor files are scored — full
  control over the edge cases worth demonstrating (the debtor with strong
  financials who pays late; thin financials, perfect history). A **real
  registry lookup** (free public company-registry API) shows the shape of a
  live integration — and is **never scored**: real-company data renders as
  information only, transiently, and is **never stored** — registry responses
  carry directors' names, which are personal data (§10, Q14). No score here is
  a credit opinion about any real company.
- **What is not claimed: calibration.** The scorecard's structure is real; its
  weights are invented. Validating weights needs loss history, and no loss
  history exists here. That caveat appears wherever a score is shown, not in a
  footnote.
- **The scorecard does not verify the trade is real.** A perfectly scored fake
  invoice scores perfectly — the scorecard reads the file it is given. Whether
  the file describes a real trade is the next subsection's job, and keeping the
  two apart is deliberate: credit answers *will the debtor pay?*, verification
  answers *does this debt exist?*

### Invoice verification — pricing the evidence

*Added 2026-09-06, from the Stenn post-mortem (§5). The thesis extended once
more: the rail is a priced decision, the funding model is a priced decision —
and so is the level of evidence behind an invoice.*

**The evidence matrix.** Every financed invoice rests on four claims, and each
claim has a set of possible attestors:

| Claim | Supplier | System of record | Carrier | Debtor |
|---|---|---|---|---|
| The invoice exists | says so | e-invoice / accounting pull | — | confirms |
| Goods actually shipped | says so | — | **B/L + tracking events** | implied by confirmation |
| The debtor owes it | says so | — | — | **confirms** |
| Nobody else financed it | says so | *(cross-lender registry — see below)* | — | pays the platform's account |

**Fraud, in evidence terms, is a claim attested only in column one.** Stenn
funded column-one-only invoices at scale. Each independent attestor added
narrows the space a fabricated invoice can live in.

**The tiers** are named bundles of attestation, and the tier is a first-class,
priced attribute of the deal:

- **T0 — self-declared.** An uploaded document. Defeats nothing.
- **T1 — source-pulled.** The invoice is fetched from an accounting platform or
  e-invoicing network, not uploaded. Fabrication now requires corrupting the
  source system — and this is §11's embedded-origination channel wearing its
  other hat: **the channel is the fraud control.**
- **T2 — shipment-verified.** A bill of lading, matched to the invoice by
  deterministic rules and checked against the carrier: shipper matches the
  supplier, consignee matches the debtor, shipment date inside the invoice
  window, ports consistent with the parties — and **one B/L can never stand
  behind two financed invoices**. Each mismatch is a named exception. The
  adapter is written against the **DCSA Track & Trace standard**; the major
  carriers run self-serve developer sandboxes, access attempted and a labelled
  mock standing in where not granted. Services invoices have no carrier — T2
  simply does not exist for them, and the tier says so rather than pretending.
- **T3 — debtor-confirmed.** A tokenised confirm-or-dispute link — single-use,
  bound to one invoice — served from the same public surface as the payment
  page. No buyer accounts, no portal. The debtor confirming "I owe this" is the
  strongest single attestation available, and the one the platform can least
  compel.

**The tier is an eligibility and advance-rate condition, not a price knob.**
Programme pricing lives in the RPA (§10, Q16): a **grid** — rate by debtor
rating band and tenor band — plus a **tier schedule**: T3-confirmed invoices
advance at the full scheduled rate, T2 at a haircut, below T2 ineligible under
the facility. Per invoice the system *applies* the signed grid,
deterministically — and **one supplier selling to three buyers sees three
rates**, each from that buyer's band and the tenor, each fixed for that pair,
none renegotiated deal to deal. The predictability promise is per supplier ×
buyer × tenor band — same pair, same band, always the same rate — which is how
programme finance actually works and what a supplier can plan around. In the
on-demand model each deal is priced individually — off the same grid, because
the same inputs must always price the same. A funder sees the tier, its
attestations, and what each one rules out.

**Attested on-chain, honestly labelled.** At funding, the platform signs an
attestation — invoice, evidence hash, tier, timestamp — recorded on-chain
(EIP-712 / EAS on Base), its identifier stored beside the ledger's settlement
evidence. What this buys is **tamper-evidence and non-repudiation, not
independent truth**: the attestor is still the platform, but the claim is
frozen at funding time and auditable ever after — the record HSBC had to
excavate at Stenn exists here by construction. True third-party attestation is
carrier-signed data (an eBL under the DCSA 3.0 standard); eBL platforms are
commercially gated, so the demo verifies a mock-carrier-signed eBL-shaped
document on-chain, labelled as the mechanism rather than the market. The
facility escrow consumes these attestations: a funder's mandate states a
minimum tier, and **drawdown requires an attestation the contract can check —
an under-evidenced invoice cannot draw committed capital.**

**What the tiers cannot close, stated for the record:** supplier–debtor
collusion with real shipments; cross-lender double financing without a shared
registry — the market's answer there is the hash-registry model (MonetaGo with
Swift; Singapore's Trade Finance Registry), which needs a market of
participants and is deliberately not imitated here by a registry of one.

### The deal

1. Supplier submits an invoice — debtor, face value, payment terms.
2. The **grid prices the deal** — rate from the debtor's rating band and the
   tenor, advance from the verification tier's schedule, all per the signed
   RPA. Ops approves, or overrules with a recorded reason.
3. Capital is applied — a funder funds this deal, or a committed facility draws
   down.
4. Supplier is paid the advance, net of fees.
5. Debtor pays the face value at maturity.
6. Funder receives principal; supplier receives the residual; platform keeps the
   margin.

**Maturity is a date, not an event.** If it passes unpaid, the invoice enters a
**matured-unpaid** state — a mechanical fact the state machine must carry, not a
credit judgement. What happens next — dunning, default, recourse — is credit
territory and out of scope; the state itself is not.

### Pricing mechanics

Carried over from the working implementation, tenor-based on an **act/360** basis:

```
principal            = face value × advance rate
tenor                = days from funding to due date
supplier interest    = principal × supplier rate × tenor / 360
supplier disbursed   = principal − supplier interest − transaction cost
funder financing     = principal − (principal × funder rate × tenor / 360)
platform margin      = funder financing − supplier disbursed
residual             = face value − principal
```

**Pricing is snapshotted at funding.** A shrinking tenor must never move the
economics of a live deal; every later leg reads the frozen breakdown.

**Currency scope, stated plainly.** The demonstration assumes USD-denominated
invoices and par redemption between USD and its stablecoin representations. The
pricing above is deliberately currency-blind because of that assumption.
Multi-currency invoicing — where the FX rate, its fixing moment and its bearer
enter the economics — is out of scope, and §8's FX row is honest about what that
leaves unmanaged.

**Calendar scope, likewise.** Tenor counts calendar days and maturity can land
on any date. Real fiat rails run on banking days, cut-off times, holiday
calendars and value dating — a payment "sent" on Friday evening exists nowhere
until Monday. The demo's simplification is stated here so nobody mistakes it
for the world; the stablecoin rail's indifference to calendars is, honestly,
part of its case.

### The rail decision

The headline feature needs mechanics, not just a claim. At approval, for each
leg the platform controls, a recommendation is produced by **deterministic rules
over the §6 differences table**. Inputs: counterparty capability (can this
supplier receive stablecoin? does this funder hold fiat?), urgency, amount
against fixed fees, finality needs, corridor. Output: a rail per leg, **with the
reasoning stated**, beside the cost, speed and risk of the alternatives it
rejected.

No model, no learning — the same case always gets the same recommendation. A
human can overrule it, and the overrule is recorded with its reason, which is
how a routing rulebook improves: by accumulating recorded disagreements, not by
guessing.

### Priority of payments

A term-sheet item most demos skip, made explicit so the ledger can enforce it
rather than an ops person deciding case by case.

The platform's margin is banked at funding — it disburses less than the funder
pays in — so at maturity only two claims contest the debtor's money:

```
1. Funder principal
2. Supplier residual
```

A part payment, once matched, pays down funder principal first; the supplier's
residual absorbs the shortfall. Until matched, it sits in unapplied cash and
the invoice does not advance.

When repayment arrives late, overdue interest (§9) enters this waterfall as
its own lines: the funder's portion rides with the payout, the platform's
books to fee income, and the supplier's charge reduces the residual — visible
lines in the ledger, never silent adjustments.

### Credit insurance — the insured variant

Funders expect it, and §3 says why: many mandates cannot hold unrated SME-debtor
risk uninsured. Trade credit insurance converts debtor default into a claim on a
carrier — **partial** (cover is typically 85–95% of face, never 100%),
**conditional** (declaration deadlines, dispute exclusions), and paid for. The
funder is named loss payee.

Embedding it in the rails means six automated steps, not a PDF policy in a
drawer:

1. **Limit check at eligibility.** The carrier's API is queried for a credit
   limit on the debtor before approval; no limit, no insured variant.
2. **Bind at funding.** Cover is bound per invoice the moment the deal funds,
   and the policy reference is recorded as evidence beside the funding event.
3. **Premium in the pricing.** A visible line in the §9 breakdown — deducted
   from the supplier's proceeds and remitted to the carrier, a pass-through,
   not margin. The remittance is itself a ledger movement, platform → carrier,
   booked like any other money.
4. **Conditions monitored by the machine.** Cover is usually voided
   administratively, not actuarially — a missed declaration window, an overdue
   not reported in time. These are dates; the machine tracks them.
5. **Claim with the evidence pack.** On matured-unpaid past the waiting period,
   the claim files with the ledger's proof: the disbursement event, the absence
   of repayment, the full trail. §10's audit-evidence question *is* the claims
   question.
6. **Claim proceeds as a settlement event.** Money from the carrier enters
   unapplied cash and is applied through the same waterfall as any other money.

**Who offers this, verified September 2026:** Allianz Trade's **Single Invoice
Cover API** — REST, sandbox-testable, built for invoice-financing platforms,
with over €4bn of transactions requested through it; **Coface**'s API portal (26
products, data on 188M companies); **Atradius** Single Transaction Cover (130+
countries). Embedded-insurance specialists: **Nimbla** (single-invoice API aimed
at funders) and **Hokodo** (API-first, underwritten via SCOR/Lloyd's, oriented
to B2B payment terms).

**Demonstration scope:** the carrier adapter is written against Allianz Trade's
published API; sandbox access is attempted, and a labelled mock stands in
wherever it is not granted — the same designed-for pattern as the Visa adapter
(§12). Whether and when the insured variant is *built* is a Discovery decision;
in the build plan it is a droppable cycle, like the escrow.

### Two funding models

**On demand.** The funder reads each deal and funds the ones they like. No idle
capital — and no instant funding, because the supplier waits for a person to act.

**Committed facility.** The funder commits; the platform draws down as invoices
clear approval. The supplier is paid in minutes. **The undrawn balance earns
nothing, and that is the honest finding** — instant funding costs the funder
carry, and the programme's job is to show what it costs rather than make it
disappear. §9 puts a number on it.

### The hidden legs — conversion

Mode 2's five legs are actually seven. The funder finances in stablecoin and the
supplier is paid fiat, so **the platform converts** — redeeming stablecoin to
fiat before leg 2, and minting fiat to stablecoin between legs 3 and 4:

```
leg 2a   platform: stablecoin → fiat   (redeem, before disbursement)
leg 3a   platform: fiat → stablecoin   (mint, before payout)
```

Circle Mint is exactly this bridge, at par. The *fee* is near zero; the *cost*
is not — each conversion adds settlement time, minimums, and a treasury
inventory question (does the platform pre-hold both forms, or convert per
deal?). The conversion is itself a rail decision with a price, which is the
thesis applying to the platform's own treasury. These legs appear in the ledger
as movements between the platform's own accounts, not as a rounding error.

### The ledger

**Double-entry, beside an event log.** Two tables, two jobs:

- **`settlement_events`** — what happened externally, *with its proof*: a
  transaction hash, a Circle payment id, a statement line.
- **`ledger_entries`** — what it means financially, balanced, referencing that
  evidence.

Every movement is two or more entries summing to zero. **Balances are never
stored**; a balance is the sum of entries for an account. Accounts include funder
facility, platform treasury per token and currency, supplier payable, **unapplied
cash**, and fees.

Unapplied cash is not an accounting nicety — it is what makes leg 3 possible.
Money arrives before anyone knows which invoice it belongs to.

**The daily proof runs across every account.** The ledger's cash account must
equal the bank's statement balance; each token treasury account must equal its
on-chain wallet balance — every account, every day, not just the escrow. A
ledger nobody proves against the outside world is a diary, and the difference,
when there is one, is by definition an unexplained item with a name and an age.

### Reconciliation — one surface, both rails

A transaction hash proves a transfer **happened** — token, amount, recipient,
beyond argument. It does not prove **which invoice it pays**. Two invoices with
the same face value, both paid from unknown addresses, are exactly as ambiguous
as two bank credits with garbled references. Stablecoin removes the *proof*
problem; *attribution* is a matching problem on every rail. Reconciliation is
therefore one engine with two kinds of evidence, not a fiat-only chore.

Five cases the programme must handle by **refusing to advance the invoice and
stating exactly what is known and what is not**:

- a payment whose reference matches no invoice
- a **part payment** against an invoice expecting full face value
- an **overpayment**
- a payment matching two invoices equally well
- a payment that **fails sanctions or address screening** — money that has
  arrived and must be held, not applied; this is where §8's frozen-address risk
  meets the flows

**Exceptions have a clock.** An unmatched item is a task, not a balance: every
exception carries an age, aging thresholds escalate it, and the queue is worked
oldest-first. Unapplied cash sitting for thirty days is an incident. This is
the operating rhythm the "reconciliation labour" cost in §9 actually consists
of, and a surface that shows exceptions without their age hides the half that
costs money.

### When settlement un-settles — reversals

The rails table says fiat is *reversible for a period*, and that sentence has
operational teeth: a wire can be recalled and an ACH returned **after the
invoice has advanced**. The programme's rule:

- the event log **never deletes** — a reversal is a new settlement event, with
  its own proof;
- the ledger books a **reversal entry pair** that backs the original out;
  the original entries are never mutated;
- the invoice **state regresses**, visibly, with the reversal named as the
  reason — a deal that was `repaid` and no longer is looks exactly like what
  happened, not like a data error.

Stablecoin's finality means this machinery is fiat-only in practice — which is
itself one of the priced differences between the rails, now with a mechanism
behind it rather than a table cell.

### Operating controls

Two controls that live in every real payments operation, present here in
demonstration form:

- **Payment-instruction integrity.** A change to a supplier's bank details is
  verified out-of-band and then **cools** — no payout uses new instructions
  inside the cooling window. Redirected-payout fraud is the classic operational
  loss, it is distinct from invoice fraud (which stays undefended, §8), and it
  is cheap to defend against.
- **Dual control.** A money movement above a stated threshold needs two
  approvers — maker and checker. In a role-switch demo this is a shape rather
  than a safeguard, and the shape is the point: the approval model must already
  have a second seat when reality arrives.

### The verification contract

One rule holds across every rail: **the browser posts decisions, not results.** A
client's claim about what happened is a hint about where to look, never evidence.
A stablecoin leg is proved by re-deriving token, recipient, sender, amount **and
chain** from the receipt. A fiat leg is proved by a signed webhook or a statement
line. Both satisfy the same interface, and the invoice state machine cannot tell
them apart.

---

## 8. Risk management framework

The risks a real receivables programme carries, and — honestly — which this
programme addresses.

| Risk | What it is | Addressed here |
|---|---|---|
| **Credit** | The debtor does not pay at maturity | **Underwritten by rule — and transferable.** A written policy, a deterministic scorecard citing its rules, limits enforced against the ledger (§7). What is *not* claimed: calibration — the weights are invented, and validating them needs loss history nobody has. The insured variant transfers to a carrier what the scorecard cannot see. |
| **Dilution** | The invoice is reduced after financing — credit note, dispute, set-off, returns | **Partially.** The ledger can represent a part payment and unapplied cash, the mechanical prerequisite. Adjudicating a dispute is not built. |
| **Fraud** | Fake invoices, or the same invoice financed twice | **Priced by evidence tier — never eliminated.** The verification tiers (§7) count independent attestors per claim and price what they count; the escrow refuses under-evidenced drawdowns. Residuals stated plainly: supplier–debtor collusion with real shipments passes; services invoices have no carrier to ask; and cross-lender doubles need a market-wide registry (§7) this platform cannot be alone in. Stenn (§5) is why this row exists. |
| **Concentration** | Too much exposure to one debtor, sector or corridor | **Partially.** A committed facility makes utilisation and exposure computable; limits are not enforced. |
| **Settlement / operational** | Money moves to the wrong place, twice, or not at all | **Yes — the programme's subject.** Idempotency on every money operation, server-side re-derivation of every external event, a reconciliation surface that refuses rather than guesses, reversal handling that regresses rather than edits, and instruction-integrity controls on payout details (§7). |
| **FX** | Hybrid mode pays a supplier in a currency the funder did not provide | **Surfaced, not managed.** The conversion legs are explicit (§7) and the demo is scoped to USD at par; rate risk, fixing and hedging are not built. |
| **Custody** | Who holds committed capital before drawdown | **Yes.** An escrow contract, so committed capital stays provably the funder's until drawn. |
| **Smart contract** | The escrow has a bug | **Named, not eliminated.** Tests assert the refusals; the contract is unaudited and says so. |
| **Token / issuer** | A stablecoin depegs, or its issuer freezes an address | **Partially.** No depeg policy or issuer diligence; but a payment failing address screening is a named reconciliation exception (§7), so a frozen or sanctioned counterparty surfaces as held funds rather than as silence. |
| **Chain** | Reorganisation, or an outage on the settlement chain | **Partially.** Chain identity is verified per transaction; confirmation depth is a stated gap. |

**The pattern is deliberate.** This programme goes deep on settlement and
operational risk, underwrites by rule with its calibration honestly disclaimed,
transfers the tail to an insurer, and is explicit that fraud is undefended. A
paper claiming all ten without caveats would be describing a bank.

---

## 9. Economics — pricing, revenue and cost

### Revenue: one stream, the spread

The funder is paid less for the money than the supplier pays for it, and the
platform keeps the difference:
`platform margin = funder financing − supplier disbursed`. It is enforced
structurally — the funder's rate must sit below the supplier's rate — so the
margin cannot go negative by construction.

Worked, on a $100,000 invoice at 80% advance, 60-day tenor, supplier 8%, funder
6%, transaction cost 0.1% of principal:

```
principal            80,000.00
supplier interest     1,066.67    80,000 × 8% × 60/360
transaction cost         80.00    0.1% of principal
supplier disbursed   78,853.33
funder financing     79,200.00    80,000 − (80,000 × 6% × 60/360)
platform margin         346.67    ≈ 43 bps on principal per 60-day cycle
                                  (≈ 2.6% p.a. at full redeployment)
residual             20,000.00    paid to the supplier at maturity
```

**The insured variant, on the same deal** — illustrative premium of 30bps of
face value for 60-day single-invoice cover on an average corporate debtor:

```
premium                 300.00    deducted from supplier proceeds,
                                  remitted to the carrier — a pass-through
supplier disbursed   78,553.33    (was 78,853.33)
platform margin         346.67    unchanged — the premium is not margin
insured amount       ~90% of face; the funder holds the uninsured slice
```

The premium rate is illustrative, not quoted; real pricing is per-debtor,
per-tenor, from the carrier's limit engine.

**The verification tier moves the advance, not the rate.** A T3-confirmed
invoice advances at the RPA's full schedule; a T0 upload advances at a haircut,
or not at all. The rate itself comes from the grid — debtor rating band ×
tenor — agreed in the RPA at credit assessment and applied per invoice without
discretion. The demo shows the same invoice at two tiers side by side: same
rate, different advance, different eligibility.

**What the supplier actually pays, all-in** — derived from the same example:
$1,146.67 of interest and costs against $78,853.33 received is **≈1.45% per
60 days, roughly 8.7% annualised** on funds received (uninsured variant).
Whether that is cheap or dear is a per-market question this paper does not
claim to answer; what matters is that the number is *shown*, which incumbent
pricing rarely is.

**What maturity passing does to the numbers.** Late repayment accrues overdue
interest on the principal, act/360, at elevated rates on both sides of the
spread: the supplier's rate + 2% is charged, the funder's rate + 2% is
received, and the platform keeps the difference — which equals the original
spread applied to the overdue days, consistent with the grid model. Worked
example: 8,000 principal at 8%/7%, ten days late → 22.22 charged, 20.00 to
the funder, 2.22 to the platform. **Who bears the charge is a programme
parameter:** in the current build it is deducted from the supplier's residual
(recourse-style — the debtor always pays exactly the face value), with
debtor-pays as the defined alternative. The charge caps at the residual: a
supplier cannot owe more than they were due. *(This replaces the v5–v8
disclosed simplification of an unremunerated overdue period — decided
2026-09-07.)*

### Cost structure

| Cost | Fiat rail | Stablecoin rail |
|---|---|---|
| Per transfer | Wire/ACH fee, plus FX spread cross-border | Gas — cents on an L2 |
| Reconciliation | Labour per exception; references typed by humans | **Proof is free and instant; attribution still needs matching** (§7) |
| Conversion | — | Par via Circle Mint; fee ≈ 0, but time, minimums and treasury inventory are real (§7) |
| Infrastructure | PSP fees, a banking relationship | RPC access, negligible |
| Compliance | Sanctions screening per payment | The same, plus address screening |

**Reconciliation labour is the cost this programme is really about.** A wire
landing with a mistyped reference costs a person twenty minutes. A stablecoin
transfer proves itself but must still be matched — a cheaper exception, not a
free one. The rails differ in how often the exception occurs and how much of it
a machine can resolve; that difference, multiplied by leg 3 on every deal, is
the operating-cost claim in §2.

### The platform's own liquidity

The conversion legs (§7) force a treasury choice the paper names and the
design phase must make: **pre-hold float in both forms** — fiat and token —
which is a working-capital requirement with a carrying cost, and buys a fast
leg 2; or **convert per deal**, which needs no float and makes disbursement
wait on Circle's mint/redeem timing. Neither is free; both are honest. What is
not acceptable is the third option most demos silently take — assuming
conversion is instantaneous and costless.

### The cost of instant funding

The committed facility's undrawn balance earns nothing:

```
committed                1,000,000
average utilisation             60%
idle capital               400,000
opportunity cost @ 5%       20,000 per year
```

**That is the price of the promise**, and the product shows it rather than hides
it. A funder can weigh it against what a supplier will pay for certainty — a
conversation two commercial parties can actually have. The market's standard
remedy is a **commitment fee** on the undrawn balance; displaying the carry is
precisely what lets the two parties price one.

### Unit economics, and the caveat

At ~43bps of principal per 60-day cycle, a $100k invoice earns the platform ~$347.
Against that: reconciliation labour, compliance screening and platform cost.
**Invoices per reconciliation exception is therefore the variable that decides
whether the model works** — and it is precisely the variable the rail choice
moves.

The breakeven has a shape even without a model: the cost base is mostly fixed
(infrastructure small, operations labour stepped), so **breakeven volume ≈
fixed monthly cost ÷ ~$347 per invoice** — and every exception avoided moves
the fixed line down. Illustrative arithmetic, same caveat as everything here.

**This is illustrative arithmetic on synthetic invoices, not a financial model.**
There is no book, no loss history, no cost of funds and no capital charge.

---

## 10. Legal and accounting: the open questions

**This section deliberately contains no answers.** Answering it would require an
entity, a jurisdiction and professional advice, none of which this project has.
Knowing which questions gate the design is the useful part.

### Legal

1. **True sale or secured lending?** Is the receivable purchased outright or
   pledged as collateral? It changes insolvency treatment, the accounting below,
   and whether the funder is an owner or a creditor.
2. **Notification or non-notification?** Is the debtor told the receivable has
   been assigned? Notification perfects the assignment in many jurisdictions;
   suppliers often resist it commercially.
3. **Assignability.** Many commercial contracts prohibit or condition assignment.
   Who checks, and what happens when a financed invoice proves non-assignable?
4. **Governing law and enforcement**, when supplier, debtor and funder sit in
   three jurisdictions.
5. **What is a stablecoin payment, legally?** Discharging a fiat-denominated debt
   by transferring a token requires the parties to have agreed it discharges.
   Silence is not agreement.
6. **Regulatory perimeter.** Whether the platform is arranging credit, operating
   a payment service, or dealing in digital assets — answered differently in the
   EU (where MiCA now governs stablecoin issuance and services), Singapore, the
   UK and the US, and determinative of licensing. The corporate-only eligibility
   rule (§7) is load-bearing here: consumer obligors would drag in a different
   regime entirely.

### Accounting

7. **Derecognition.** Under **IFRS 9** — and **ASC 860** for US GAAP — does the
   supplier remove the receivable from its balance sheet? It turns on transfer of
   substantially all risks and rewards, and recourse usually decides it.
8. **Recourse.** If the debtor defaults, does the supplier bear it? Simultaneously
   a credit, legal and accounting question, and the hinge for 1 and 7.
9. **How is a stablecoin balance carried?** Cash, cash equivalent, or an
   intangible asset? It changes the funder's reported position and, in some
   regimes, its tax.
10. **Revenue recognition** on the spread — at funding, or across the tenor?
11. **Audit evidence.** What does an auditor accept as proof a payment occurred?
    A bank statement is well understood; a transaction hash is not yet.

### Insurance

12. **Insurable interest and the loss payee.** Who holds the policy — supplier,
    platform or funder — and does the assignment of the receivable carry the
    right to claim with it? Getting this wrong discovers itself at claim time.
13. **Does insurance shift the derecognition test?** Cover changes who bears
    the risks and rewards, which is the hinge of question 7 — so the insured
    and uninsured variants may sit on different sides of IFRS 9's line.

### Platform and data

14. **Data protection.** Registry responses carry directors' names — personal
    data under GDPR and its cousins. The demo's posture: registry data renders
    transiently and is never stored (§7). A real programme needs a lawful
    basis, a retention policy, and an answer for debtor payment-behaviour data,
    which is profiling.
15. **AML/CFT programme ownership.** Screening payments is a control, not a
    programme. Transaction monitoring, suspicious-activity reporting and the
    obligations they create sit with a named, accountable party — which party,
    under which regime?
16. **The contract stack.** A master receivables purchase agreement with the
    supplier, a participation or assignment agreement with the funder, a notice
    to the debtor. None exists here — and the RPA is load-bearing for the
    mechanics: it is where the pricing grid, the tier schedule, the facility
    limit and the per-buyer sub-limits live (§7), so what the system applies
    per invoice is a signed document, not a discretion. A real programme *is* these documents, and the platform is
    their execution layer.
17. **The escrow's legal character.** If code holds the funder's committed
    capital, is the platform a custodian in law anyway — whoever holds the
    keys? The answer decides whether the escrow reduces regulatory burden or
    merely relocates it.

**Question 11 is the one this project can actually contribute to**, because the
ledger design is an answer to *"what evidence would satisfy someone who has to
sign off on it?"*

---

## 11. Go-to-market — a hypothesis, not a plan

There is no company, so this states **what would have to be true**, not a plan to
execute.

**The wedge.** Not "a better financing platform" — incumbents are fine at
financing. The wedge is the **crypto-native treasury holding stablecoins with no
route to short-duration real-economy yield** that does not require off-ramping.
A small, identifiable, reachable population with a specific unmet need.

**First test — partially answered by the market.** On-chain private credit at
~$8B active TVL (§5) is evidence that stablecoin capital does want real-economy
credit exposure. What remains genuinely open is narrower and sharper: would such
a treasury take **direct, per-invoice exposure with a visible settlement
choice**, rather than the pooled, tranched exposure Centrifuge and Maple sell
today? Ten conversations answer it. **If the answer is no, the programme is a
feature for those platforms, not a product.**

**Second test.** Would a supplier accept payment in stablecoin at all? Mode 2
exists because I expect the answer is mostly no — but that is an assumption, and
a cheaply testable one.

**The insurance lever.** An insured programme widens the funder pool past the
crypto-native wedge to mandates that cannot hold unrated SME-debtor risk at all
(§3). If the first test disappoints, this is the adjacent population.

**Distribution scales through the facility, not the marketplace.** A treasury
with $5M to deploy cannot make fifty per-invoice decisions — which is exactly
why the pooled platforms in §5 exist. The committed facility is this
programme's answer: commit once, set the mandate, and auto-drawdown deploys it.
**The facility is the distribution product**; per-deal selection is the
transparency layer underneath it, not the way size arrives.

**Origination is the expensive side, and "direct" is the wrong channel.**
Suppliers needing financing are numerous — and acquiring them one by one is
costly, and KYC friction kills funnels. The channel hypothesis is **embedded
origination**: accounting platforms, e-invoicing networks and B2B marketplaces
where the invoice already exists as data — which an API-first build is the
precondition for. Direct SME acquisition is the fallback, priced as such.

**The two objections, answered in one line each.** The supplier asks *"why not
my bank or factor?"* — because money arrives in minutes not days, and the price
is shown rather than discovered. The funder asks *"why not Centrifuge or
Maple?"* — because this is direct per-deal exposure with a visible settlement
choice and an insured option, not a pool token. If neither answer lands in ten
conversations, the first test above has failed and the paper says what follows.

**Sequencing.** Supply of capital before demand for it. Funders willing to take
unfamiliar risk on an unfamiliar rail are the scarce side; the embedded
supplier channel is switched on after capital exists to meet it.

**What would kill it.** A regulated funder's mandate prohibits holding
stablecoins; the pooled structures prove to be what the capital actually wants
(see the first test); or the debtor side proves so uniformly fiat that mode 3
has no market and mode 2's advantage falls only on legs the funder does not care
about.

---

## 12. What this is not, and how to judge it

### What it is not

- **No real money.** Testnets, sandboxes and mocks throughout. No custody of
  anything, at any point.
- **The credit process is real; the calibration is not.** Policy, scorecard,
  limits and risk-based pricing all exist and are explainable — but the weights
  are invented, no loss history validates them, and no score is a credit
  opinion about any real company.
- **Fraud is narrowed and priced, not eliminated.** The verification tiers
  count independent attestors and the escrow refuses under-evidenced
  drawdowns — but collusion with real shipments passes, services invoices have
  no carrier to ask, and cross-lender doubles need a registry with more than
  one participant. The on-chain attestations are **platform-signed**:
  tamper-evident and non-repudiable, not independently true.
- **Single-currency.** USD invoices, par USD↔stablecoin. The FX dimension of
  multi-currency trade is named (§7) and not built.
- **Not a Visa integration.** An adapter written against published documentation,
  behind a mock, because the platform's API is not publicly available. Every
  surface showing it says so.
- **Only one token is real.** USDC on Base Sepolia is genuine testnet USDC; the
  second is a mock ERC-20 standing in for a token with **no public testnet we
  could locate as of September 2026** — re-verified before first commit.
- **No insurance exists.** The insured variant prices a premium and carries the
  claim states; the carrier is a sandbox where access is granted and a labelled
  mock where it is not. No policy is bound, no cover is real.
- **The escrow contract is unaudited.** It exists to make a custody argument
  concrete, not to hold anyone's money.
- **No legal or accounting opinion.** §10 is a list of questions; treating it as
  answers would misuse this document.
- **No company.** No entity, no licence, no counterparties, no production.

### How to judge it

Written before building, so it can be held against the result:

1. **One invoice settles three ways**, with cost, speed and settlement risk for
   each, and a recommendation that states its reasoning.
2. **The five legs are genuinely independent** — a fiat leg and a stablecoin leg
   are indistinguishable to the invoice state machine, proved by running one deal
   through all three modes and comparing the resulting ledger.
3. **Reconciliation is proved by its exceptions** — wrong reference, part payment,
   overpayment, ambiguous match, failed screening — each leaving the invoice
   unadvanced and stating what is known; and a post-settlement reversal
   regresses the invoice with a booked reversal pair, never an edit.
4. **The custody question is answered rather than deflected**, with on-chain
   balance asserted equal to ledger balance — a proof that runs across every
   account, bank and token wallet alike, not just the escrow.
5. **The cost of instant funding is displayed, not buried** — the facility view
   shows the undrawn balance and what it is costing, in the same UI that shows
   the speed it buys.
6. **The insured variant changes the numbers, not the machine** — the premium
   is a visible pricing line, the claim path exists as ledger states, and
   nothing pretends a real policy stands behind it.
7. **Every credit score cites its policy rule**, a limit breach is refused with
   the exposure arithmetic shown, and the scorecard's unvalidatability is
   stated where the scores are shown — never in a footnote.
8. **The assurance tier is visible, priced, and evidenced** — a tier the
   recorded attestations do not support cannot be claimed, the tier is attested
   on-chain at funding where the escrow can refuse it, and one bill of lading
   never stands behind two financed invoices.
9. **The limits are published at the same size as the results**, and no rate is
   claimed from a handful of runs.

**If the first is true and the rest are not, this is a demo. If all nine are
true, it is an argument.**

---

## Sources

- Asian Development Bank, *Global Trade Finance Gap Survey*, 15 January 2026 —
  $2.5tn gap, ~10% of global trade, 41% SME rejection rate, 110+ providers.
  https://www.adb.org/publications/adb-global-trade-finance-gap-survey
- Visa, *Visa Accelerates Stablecoin Momentum: Adding Five Blockchains for
  Settlement*, 2026.
  https://usa.visa.com/about-visa/newsroom/press-releases.releaseId.22336.html
- Fortune, *Visa launches new platform to provide stablecoin services to more
  than 200 million merchants*, 16 July 2026 — Visa Stablecoin Platform, Open USD
  as launch token.
  https://fortune.com/2026/07/16/exclusive-visa-new-platform-stablecoin-services-200-million-merchants/
- Global Trade Review, *Stenn claims UK trade finance firm sold it fake
  invoices*; Trade Finance Global, *Where they went wrong: the collapse of Stenn
  and Kimura* — administration 4 Dec 2024, ~$1bn owed, >$220M questionable
  invoices identified by HSBC.
  https://www.gtreview.com/news/europe/stenn-claims-uk-trade-finance-firm-sold-it-fake-invoices/
  https://www.tradefinanceglobal.com/posts/where-they-went-wrong-the-collapse-of-stenn-and-kimura/
- On-chain private credit figures (~$8B active TVL mid-2026; Centrifuge ~$1.6B
  TVL, invoice/trade-finance pools $400M+; Maple deposits >$4B) — Spark
  Research, *Tokenized Private Credit*, and eco.com, *Tokenized Private Credit
  2026: Maple, Centrifuge, Goldfinch Compared*.
  https://www.spark.money/research/tokenized-private-credit-onchain
  https://eco.com/support/en/articles/15254025-tokenized-private-credit-2026-maple-centrifuge-goldfinch-compared
- Trade credit insurance — Allianz Trade, *Single Invoice Cover* (REST API,
  sandbox, >€4bn of transactions requested); Coface API portal; Atradius Single
  Transaction Cover; Nimbla; Hokodo. Verified September 2026.
  https://www.allianz-trade.com/en_BE/trade-credit-insurance/solutions/single-invoice-cover.html
- Duplicate-financing registries — Swift's pilot with MonetaGo; Singapore's
  Trade Finance Registry (Association of Banks in Singapore); FCI partnership;
  India Factoring deployment (March 2026). Verified 2026-09-06.
  https://www.gtreview.com/news/top-stories/exclusive-swift-launches-double-financing-fraud-solution-pilot-with-monetago/
  https://www.gtreview.com/news/asia/singapore-goes-live-with-anti-fraud-registry-to-eliminate-duplicate-financing/
- Stenn collapse mechanics — debtors denying relationships, repayments from
  lookalike entities — Global Trade Review and Trade Finance Global, cited in
  §5's sources above.
- Shipment verification — DCSA Track & Trace standard (v2.2 in production,
  3.0 in 2026) and eBL 3.0; self-serve developer portals with sandboxes at
  Maersk, CMA CGM and Hapag-Lloyd. Verified 2026-09-06.
  https://blog.shipmnts.com/ocean-carrier-track-and-trace-apis-integration-guide
- Circle sandbox capability, probed directly 2026-09-04; recorded in
  `STACK_RULES.md`. Read-only calls, nothing written.
- The five-leg model, the pricing mechanics and the verification contract come
  from the author's own earlier implementation (`receivables-financing-mvp`,
  private), which settles every leg in testnet USDC on Base Sepolia.

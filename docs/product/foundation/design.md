# Design — Foundation (cycle 0)

Date: 2026-09-06 · From: `docs/product/foundation/discovery.md`

## Step 1.0 — Existing-implementation verdict

**Verdict: NEW.**
**Evidence:** 0 pages, 0 API routes, no `package.json`, no migrations, 0 commits
— audited at Discovery Step 0 (2026-09-06) and recorded in
`discovery-kit/YOUR_PRODUCT.md`. Nothing exists to enhance or fix.

One thing named so it cannot ride silently: three modules are copied in from
the sibling repo `receivables-financing-mvp`, each with defects repaired **at
the door** as its own piece of work (see §7): `src/lib/web3/verify.ts:30-84`
(chain hard-coded, first-matching-log only, float amounts),
`src/lib/pricing.ts:56-106` (floats, zero tests), `src/lib/api-helpers.ts:50-85`
(sound patterns; the treasury-by-admin-row lookup at lines 9–43 of that file is
explicitly **not** copied).

Cycle 0 runs **without an allow-list** (NEW-project mode, STACK_RULES.md);
the boundary trigger — the spine clickable end to end — turns cycle 0's output
into the host every later cycle must justify touching.

## Part 1 — Product design

### 1. Feature statement

A clickable foundation that carries one invoice from live submission through
approval, funding and disbursement behind human gates, booking every movement
as balanced integer ledger entries with derived-only balances, across four
switchable roles — on testnets and labelled demo-internal evidence only.

### 2. Target workflow

1. Supplier (via role switch) submits an invoice: debtor, face value,
   currency, due date.
2. Ops sees it in the review queue, sets terms (advance rate, supplier rate,
   funder rate, transaction cost), and approves — or refuses, with the
   failing reason named on screen.
3. Ops confirms **funding**: the pricing snapshot locks at this moment
   (copied `pricing` semantics — a shrinking tenor can never move a funded
   deal), and the financing leg books as balanced entries.
4. Ops confirms **disbursement**: the disbursement leg books, fee lines
   visible as their own entries.
5. Role switch: supplier's surface shows the disbursement; funder's shows the
   position; each role sees only its own book.
6. The ops ledger view shows every movement's entries summing to zero and
   every balance derived live as SUM(entries).

Deferred (from discovery row 2): settlement evidence is a labelled
demo-internal reference until cycle 1's rail; approval is an unassisted ops
decision until the credit machinery attaches in cycles 6–7; repayment/payout/
residual legs and the full state machine (matured-unpaid, holds, reversal
flows) are cycles 1–3 territory.

### 3. States & transitions

| State | Entered by | Moved by | Notes |
|---|---|---|---|
| `submitted` | supplier's live submission | — | the trigger |
| `approved` | ops, after terms are set | ops | terms are editable until funding |
| `refused` | ops, instead of approving | ops | **terminal in cycle 0** — the correction path is a new submission, not resurrection; refusal shows its reason |
| `funded` | ops confirms the funding gate | ops | pricing snapshot locks here; financing leg books |
| `disbursed` | ops confirms the disbursement gate | ops | disbursement leg books; **terminal for cycle 0** — the spine's end, matching the boundary trigger in STACK_RULES.md |

- **Irreversible:** every booked movement. Cycle 0 has no reversal UI; a
  booking is permanent and a state never regresses. (Reversal pairs are
  cycle 3's design; the ledger's append-only shape is what makes them
  possible later.)
- **What the flag hides: nothing — there is no flag.** The foundation *is*
  the host; a `NEXT_PUBLIC_ENABLE_*` flag guards a feature inside a host, and
  none exists. Recorded as a decision, not an omission. Every later cycle
  gets a flag; this one cannot.
- Illegal transitions refuse with the failing rule named (e.g. disburse
  before funded → "invoice is not funded").

### 4. Data contract

Reads/Writes: **no tables exist** (`database.types.ts` is not yet generated —
the Drizzle schema in this cycle's migrations becomes the source of types).
Every table below is a **new-table decision, surfaced here**:

- **`parties`** — synthetic actors: name, role (`supplier | funder | platform |
  debtor`). No real company, no real person, ever (discovery row 7).
- **`invoices`** — supplier→party, debtor→party, `face_value_minor` (bigint),
  `currency` (**`USD` only in cycle 0** — multi-currency FX is a programme
  non-goal, PRD §9; per-token/currency accounts arrive with the rails),
  `due_date`, `status`, terms as basis points (`advance_rate_bps`,
  `supplier_rate_bps`, `funder_rate_bps`, transaction cost type+value),
  `pricing_snapshot` (jsonb, written once at funding, never recomputed).
- **`accounts`** — the chart, as real rows: `funder_cash`,
  `platform_treasury`, `supplier_payable`, `fee_income`; each with owning
  party and currency. This is the structural correction of the sibling's
  treasury-as-first-admin-row defect — the treasury is an account, not a
  profile lookup.
- **`settlement_events`** — what happened, with evidence: type,
  `evidence_kind` (cycle 0 books only `demo-internal`; `tx-hash`,
  `circle-payment-id`, `statement-line` join in cycles 1–3), `evidence_ref`,
  `idempotency_key` (unique — the copied `recordTransactionOnce` property,
  enforced by the database).
- **`ledger_entries`** — event ref, account ref, signed `amount_minor`
  (bigint). Entries per event **sum to zero** — enforced in the one booking
  module every money route calls, asserted by test. **No balance column
  exists anywhere**; a balance is `SUM(amount_minor)` for an account, always.

Entry shapes for the two cycle-0 movements (amounts from the locked snapshot):

```text
funding        funder_cash         −principal
               platform_treasury   +principal

disbursement   platform_treasury   −principal
               supplier_payable    +disbursement_amount
               fee_income          +(principal − disbursement_amount)
```

The second is deliberately a three-entry movement: it proves the ledger core
handles n-way balanced entries and makes the fee lines visible as lines, never
margin (paper §7).

**Money is bigint minor units end to end** — the copied pricing module is
converted from float `round2` to integer cents with its rounding rule
documented in its new tests; a fractional or non-integer amount is rejected at
the API boundary.

**Fixtures:** one seed script (per discovery row 7 and
`SYNTHETIC_DATA_STARTER.md`): four role identities, synthetic
suppliers/debtors/one funder, the account chart, and backdrop invoices across
all five states so queues and lists render honestly. The spine's own invoice
is never pre-staged.

### 5. Screens & components

`DESIGN_SYSTEM_NOTES.md` is audited-empty; **this section is the identity
decision** (chosen by Chetan this session: a fresh identity, modern fintech
SaaS direction), and it seeds that file's rewrite when cycle 0 lands.

**Identity spec — "modern fintech SaaS," made specific:**

- **Palette:** white ground `#FFFFFF`, cool surface `#F7F8FA`, ink `#16192E`,
  muted `#5A6072`, accent **cobalt `#2742F5`** (actions, links, focus).
  Semantic — chosen once, meaning only this: settled/booked **green
  `#0E9F6E`** (solid pill); **in-flight amber `#B45309`** (hollow pill,
  dashed ring) — the "initiated, not settled" slot DESIGN_SYSTEM_NOTES
  reserves, idle in cycle 0's instant demo-internal bookings but defined now
  so cycles 1–2 inherit it rather than invent it; refusal **red `#C81E1E`**,
  reserved for refusals and nothing else. Dark mode is not designed in cycle
  0 — one theme, done properly.
- **Provenance is not a colour:** mock/demo-internal anything wears a
  **dashed-border neutral badge with the word in it** (`demo-internal`,
  `mock`), and the app shell carries a persistent thin banner:
  "Demonstration — testnets and synthetic data only." Visible without
  reading colour, per the DESIGN_SYSTEM_NOTES rule.
- **Type:** Instrument Sans (UI and display, 600-weight headings,
  tight tracking) + IBM Plex Mono for **every amount, reference and evidence
  string**, `tabular-nums`. No serif anywhere — the deliberate break from the
  flow-plates' print identity.
- **Shape:** 8px spacing grid, 10px card radius, one soft shadow level,
  1px cool-grey borders. No gradients, no glassmorphism.

**Surfaces** (routes are cycle-0-created, so named here as the contract):

- App shell: top bar with product name, the **role switch** (segmented
  control, four roles — the app's defining control), and the provenance
  banner.
- Supplier `/supplier`: invoice list + "New invoice" form; detail with status
  timeline and amounts.
- Ops `/ops`: review queue → `/ops/deals/[id]`: terms form,
  Approve / Refuse, then the Fund and Disburse gates, with the deal's booked
  entries beneath; `/ops/ledger`: the chart of accounts with derived
  balances and the entries feed.
- Funder `/funder`: position view (deals funded, derived balances).
- Debtor `/pay/[invoiceId]`: **public stub**, labelled — the real payment
  surface arrives with the rails.

**Primitives created** (the first vocabulary, in `src/components/ui/`):
Button, Card, Table, Field/Input, StatusPill, ProvenanceBadge, Banner,
ConfirmDialog (the human-gate control), AmountText (mono, tabular,
minor-units renderer). Later features import these; cycle 0 writes them.

### 6. Permissions

No sign-in, by design (STACK_RULES.md, [DECIDED]). The active role is held in
a **cookie set by the role switcher and read server-side**; every surface
declares its required role in its server layout. Wrong role → a role-gate
card naming whose surface it is, with the switch offered — never the data.
The debtor pay stub is public and unauthenticated, as a payment link is in
reality. This mechanism replaces the `[UNVERIFIED]` permission block in
STACK_RULES.md with file:line when built.

**The identity seam (decided 2026-09-06, Chetan's direction):** every surface
and route reads identity through one module — `getIdentity()` — whose cycle-0
implementation is the role cookie. A later cycle (the accounts-mode cycle,
slotted after the headline ships) swaps in real sessions behind the same
interface, selected by an `AUTH_MODE` env switch: one codebase, two
deployments (public demo · login-gated accounts variant). Nothing outside the
seam may read the cookie directly — that rule is what keeps the second
variant a module swap instead of a rebuild.

### 7. Error & edge handling

- Terms unset → Approve and Fund gates disabled, the missing rule named
  (`readLockedPricing`-style null is a refusal, not a crash).
- Double submission → the `idempotency_key` unique constraint refuses the
  second booking; the surface says "already recorded," copied from
  `recordTransactionOnce` semantics.
- Unbalanced movement → the booking module refuses; unreachable via UI and
  asserted by test.
- Non-integer amount at any boundary → rejected with a named error.
- Empty queues/lists → honest empty states, not skeletons.
- **The named repairs to the copies** (each its own piece of work):
  1. `pricing.ts` — float `round2` → integer minor units; the test suite it
     never had (snapshot lock, act/360 tenor, margin identity).
  2. `verify.ts` — chain id becomes an explicit per-call parameter (the
     declared-but-never-read `NEXT_PUBLIC_CHAIN_ID` defect); **all** logs
     matching the token are checked, not the first; amounts as bigint.
     Copied, corrected and unit-tested in cycle 0; first wired in cycle 1.
  3. `api-helpers.ts` — `recordTransactionOnce` and `maybeCompleteInvoice`
     patterns carried into the ledger module; the admin-row treasury lookup
     left behind (replaced by the `accounts` table).

### 8. Human gates

Per STACK_RULES.md high-stakes surfaces ([DECIDED]), each **before** its
consequence:

- **Approve / Refuse** — ops decision, no money moves.
- **Fund** — ConfirmDialog shows the exact entries about to book (accounts
  and amounts from the locked snapshot); nothing books until ops confirms.
- **Disburse** — same shape, second gate.

The browser posts **decisions, never results**: `{invoiceId, action}` and
nothing else; the server recomputes amounts from its own data every time. No
gate existing today can be weakened, because none exists — these are the
first, and later cycles inherit them.

## Part 2 — The agent question (default no)

**Step needing judgment:** none — concede. Steps 1–6 are forms, deterministic
state transitions, arithmetic from a locked snapshot, and two human decisions
(approve, confirm). The only judgment in the workflow — "should this deal be
approved?" — is deliberately human in cycle 0 and becomes *rule-based, not
model-based* when the credit machinery attaches (cycles 6–7: a deterministic
scorecard where every score cites its policy rule).
**What it would read that product logic cannot evaluate:** nothing exists to
read — no documents, no policy pack, no context beyond the form fields.
**Cost per run vs value:** any cost loses to zero value; STACK_RULES.md also
decides this project calls **no model API** without a recorded decision.
**Failure mode:** an agent here could only mis-book money — precisely what
the human gates and the balanced-booking refusal exist to prevent.

**Verdict: NO AGENT** — the feature ships as Part 1 alone. Discovery row 6's
hypothesis confirmed, and a success of the method.

## Part 3 — Agent blueprint

Not earned. Omitted.

## Build order

Part 3 did not run — single slice: the substrate is the feature.

## Integration contract

The template's NEW pattern (feature folder + flag + allow-list) **does not
apply to cycle 0 and is consciously replaced** (STACK_RULES.md boundary mode:
NEW — no host to protect, no allow-list, no flag). In its place, the contract
is the named file map, so Develop's Gate 0.5 can still verify scope:

**Created (the file map):**
- Scaffold: `package.json`, `next.config.ts`, `tsconfig.json`, Tailwind
  config, `src/app/layout.tsx` + shell
- Data: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`,
  `drizzle/` migrations (every table above, from the first migration),
  `scripts/seed.ts`
- Ledger core: `src/lib/ledger/` (booking module — the only writer of
  entries), `src/lib/money/` (integer minor-units helpers)
- Copies, corrected: `src/lib/pricing/` ~~, `src/lib/rails/verify.ts`
  (unwired until cycle 1)~~ — **contract amended 2026-09-06 at Chetan's
  decision, surfaced by the gap audit:** the chain verifier moves to cycle 1,
  where its corrected interface (explicit chain id, all-logs matching, bigint
  amounts) is the settlement seam's own design and viem enters with a caller.
  Porting it into cycle 0 would have been dead code behind a new dependency.
- Roles: `src/lib/roles/` + the cookie switcher
- Surfaces: the routes in §5, `src/components/ui/` primitives
- Tests + the four gate commands (`tsc --noEmit` · lint · test · build),
  recorded back into STACK_RULES.md with real counts
- Env: `DATABASE_URL` in `.env.local` (already templated in `.env.example` —
  no `.env.example` change needed; no new secrets)

**Untouchable even in cycle 0:** the five kit folders (edited only
deliberately) · `docs/product/` records of other features ·
`PRODUCT_PAPER.md` (never edited without Chetan's confirmation — standing
rule) · no model API key, no mainnet config, no secret that can cost money.

**Git:** the repo has zero commits; nothing is committed without Chetan's
explicit go-ahead. When given, the first commit establishes `main` (docs +
process), and the build proceeds on `feat/foundation`.

## Eval plan

1. **Happy path:** submit → set terms → approve → fund → disburse, live; the
   supplier surface shows the disbursement, the funder surface the position,
   and the deal's entries sum to zero at every step.
2. **Edge — double booking:** confirming Fund twice books exactly once; the
   second attempt surfaces "already recorded" (idempotency key held by the
   database, not the UI).
3. **Edge — missing terms:** Fund attempted on an invoice without rates is
   refused with the missing rule named; nothing books.
4. **Edge — role isolation:** supplier A's list never contains supplier B's
   invoice; the funder sees positions, not the supplier's book; the debtor
   stub shows only its own invoice — asserted per role.
5. **Boundary — the invariant holds:** an unbalanced movement handed to the
   booking module is refused; no schema table has a balance column; every
   rendered balance equals SUM(entries) recomputed in the test — and a
   fractional amount at the API boundary is rejected.

## Build-readiness gate

- Job in one sentence: **yes** (§1).
- Every fact traced to a named file or table: **yes** — sibling modules by
  path:line, decisions to STACK_RULES.md/PRD/paper, new tables surfaced in §4.
- Missing-data behavior known: **yes** (§7).
- Human gate before every consequence: **yes** (§8 — gates precede bookings).
- One eval case tests the limit: **yes** (eval 5).
- Contract names every file to be touched: **yes** — as a created-file map,
  the NEW-mode substitute for an allow-list, reason recorded.
- Part 3: did not run — no agent, reason in Part 2.

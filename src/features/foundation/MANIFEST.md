# Manifest — foundation (cycle 0) · branch `feat/foundation`

## The contract (from docs/product/foundation/design.md — verified at Gate 0.5, 2026-09-06)

NEW-project mode: **no allow-list, no flag** — the foundation *is* the host
(STACK_RULES.md boundary mode). In their place, the created-file map below is
the boundary; a file not on it is a stop-and-ask before creation.

**File map (to be created):**
- Scaffold: `package.json`, `next.config.ts`, `tsconfig.json`, Tailwind
  config, `src/app/layout.tsx` + shell
- Data: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`,
  `drizzle/` migrations, `scripts/seed.ts`
- Ledger core: `src/lib/ledger/` (sole writer of entries), `src/lib/money/`
- Copies, corrected: `src/lib/pricing/`, `src/lib/rails/verify.ts` (unwired)
- Roles: `src/lib/roles/` (`getIdentity()` seam) + cookie switcher
- Surfaces: `/supplier`, `/ops`, `/ops/deals/[id]`, `/ops/ledger`, `/funder`,
  `/pay/[invoiceId]`; `src/components/ui/` primitives
- Tests + gate commands; STACK_RULES.md gate section rewritten with real
  numbers when they exist
- Env: `DATABASE_URL` in `.env.local` only (slot already in `.env.example`)

**Untouchable:** kit folders (gitignored) · `PRODUCT_PAPER.md` (never without
Chetan's confirmation) · no model API key · no mainnet config · no secret that
can cost money · no stored balance column, anywhere, ever.

**Schema changes:** only the five tables the design's data contract names
(`parties`, `invoices`, `accounts`, `settlement_events`, `ledger_entries`),
each re-approved immediately before the migration is written.

**Smoke path (agreed at Gate 0.5):** boots with role switch → full spine on
one invoice (submit → approve → fund → disburse, supplier sees payment) →
role isolation per seat. Phases in as prompts land.

**Git:** commit per verified prompt, message carries the prompt number; never
push (no remote exists).

## Files created

- `src/features/foundation/MANIFEST.md` — this file (rails)
- `AGENTS.md` (repo root, branch-only) — foundation rules block (rails)
- `package.json`, `package-lock.json` — pinned exact versions (A0)
- `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`,
  `eslint.config.mjs` — canonical create-next-app@16.3.4 output (A0)
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`,
  `src/app/favicon.ico` — minimal boot shell, placeholder page (A0)
- `vitest.config.mts` — one runner, reason documented inline (A0)
- `tests/gate.test.ts` — placeholder; retired at A2 (A0)
- `next-env.d.ts` — generated (A0)

- `src/db/schema.ts` — the five approved tables, enums, no balance column (A1)
- `src/db/client.ts` — `getDb()`, URL read at call time, never module-level (A1)
- `drizzle.config.ts` — loads `.env.local` itself; migrations out to `drizzle/` (A1)
- `drizzle/0000_mature_bromley.sql` + `drizzle/meta/` — first migration,
  applied to Neon 2026-09-06 (A1)
- `scripts/seed.mts` — wipe-and-refill synthetic backdrop: 7 parties, 5
  accounts, 4 invoices (submitted×2/approved/refused); funded/disbursed
  deliberately deferred to A2 via the ledger module (A1)

- `src/lib/money/index.ts` + `money.test.ts` — bigint minor units, the float
  refusal, divRound half-away-from-zero (the one place rounding is defined),
  act/360 interest, display formatting (A2)
- `src/lib/pricing/index.ts` + `pricing.test.ts` — the sibling module
  corrected: bigint, tested to the cent against the design's worked example;
  snapshot (de)serialization that refuses corrupted fields (A2)
- `src/lib/ledger/index.ts` + `ledger.test.ts` — THE SOLE WRITER: validate
  (≥2 entries, no zeros, bigint, Σ=0) before any db call; atomic batch
  booking; 23505 → "ledger-already-recorded"; balanceOf/balances as SUM (A2)
- `src/lib/domain/states.ts` + `states.test.ts` — the 5-state machine, full
  25-pair matrix pinned (4 legal), refusals name their rule (A2)

- `src/app/globals.css` (rewritten) — the identity tokens as Tailwind theme:
  paper/card/surface/ink/muted/line + cobalt + reserved good/flight/refuse (A3)
- `src/lib/cn.ts` — dependency-free class join (A3)
- `src/components/role-switch.tsx` — segmented four-seat nav (visual; cookie
  identity arrives at A4) (A3)
- `src/components/ui/{card,button,table,status-pill,provenance-badge,amount}.tsx`
  — the first vocabulary; provenance = dashed badge with the word, never a
  colour; every amount renders through Amount (mono, tabular, minor units) (A3)
- `src/components/deal-timeline.tsx` — spine timeline incl. the refused branch (A3)
- `src/lib/queries.ts` — read-side joins for every surface; movements grouped
  per event; balances via lib/ledger only (A3)
- `src/app/{page,supplier/page,ops/page,ops/deals/[id]/page,ops/ledger/page,funder/page,pay/page,pay/[invoiceId]/page}.tsx`
  — landing + the six designed surfaces, all force-dynamic, reading live
  Neon; gates rendered disabled until A5; pay stub public and labelled (A3)

- `src/lib/roles/parse.ts` + `parse.test.ts` — pure identity parsing: the
  cookie is a claim; garbage collapses to null, never a privileged default (A4)
- `src/lib/roles/identity.ts` — getIdentity(), THE seam; sole cookie reader (A4)
- `src/lib/roles/actions.ts` — switchSeat / actAsSupplier server actions;
  party claims validated against the db before storage (A4)
- `src/lib/roles/gate.tsx` — seatGate() for PAGES, deliberately not a layout:
  a layout withholding {children} still ships the page's data in the RSC
  payload (found by curl mid-A4, fixed, re-proven clean) (A4)
- `src/components/role-gate.tsx` — the wrong-seat card: names the surface,
  offers the switch, never the data (A4)

- `src/lib/money` (extended) — `parseDecimalToMinor`: the only door
  human-typed money comes through; refuses excess precision rather than
  rounding (A5)
- `src/lib/deals/preview.ts` + `preview.test.ts` — the two entry shapes as
  pure functions, shared by the gate dialog and the booking action so the
  confirmation cannot drift from the consequence (A5)
- `src/lib/deals/actions.ts` — the five server actions: submit, approve with
  terms, refuse with reason, fund, disburse. Seat-checked, state-checked,
  amounts recomputed server-side, booked via lib/ledger, every failure a
  readable sentence (A5)
- `src/components/ui/confirm-dialog.tsx` — the human gate: shows the exact
  entries and their Σ before booking; posts only the invoice id (A5)
- `src/components/submit-invoice-form.tsx`, `src/components/review-form.tsx`
  — the live supplier trigger and the ops terms/refusal forms (A5)

## Files modified

- `STACK_RULES.md` — gate section rewritten with real numbers; framework
  versions pinned; Next 16 quirks re-verified against installed local docs (A0)
- `package.json` / `package-lock.json` — +drizzle-orm 0.45.2,
  +@neondatabase/serverless 1.1.0, +drizzle-kit 0.31.10, pinned exact (A1)
- `tsconfig.json` — target ES2017→ES2022 (bigint literals are money here);
  +allowImportingTsExtensions for the node-run seed (A1)

## Progress notes

- 2026-09-06 · rails: first commit `9c6bcb4` on `main` (22 docs/process
  files); branch `feat/foundation` cut; no flag by design.
- 2026-09-06 · A0: scaffold + gate. All four gate commands green (tsc 0 ·
  lint 0 · test 1/1 · build ✓, `/` serves via next start). @types/node
  bumped 20→24.13.3 for vitest 5 peer range.
- 2026-09-06 · A1: schema approved by Chetan before writing; migration
  0000 generated and applied to Neon; seed run and verified by count query
  (7/5/4/0/0). Four gates green (stale tsconfig.tsbuildinfo cleared after
  the ES2022 bump — cache, not code).
- 2026-09-06 · A2: money/pricing/ledger/states built with 31 tests (the
  placeholder retired). One real bug caught by its test: terminal-state
  refusal messages ranked below transition-specific ones — fixed. Seed
  extended: funded + disbursed backdrop booked THROUGH lib/ledger; verified
  in Neon by SQL (3 events all Σ=0; balances derive and reconcile to zero
  across the chart). Domain modules use relative .ts-extension imports so
  node-run scripts resolve them; Turbopack build confirmed fine with it.
  Files also touched: scripts/seed.mts (backdrop), src/db/client.ts
  (./schema→./schema.ts), tests/gate.test.ts deleted.
- 2026-09-06 · A3: identity layer (Instrument Sans + IBM Plex Mono via
  next/font, token palette in globals.css), 6 ui primitives, role-switch
  shell, and all seven routes serving live Neon data — verified by curl
  against the production server (amounts, statuses, evidence badges all
  present; smoke leg 1 "boots with role switch" now walkable). Layout.tsx
  also modified (shell + banner + fonts). Gates green (tsc · lint · 31/31 ·
  build). Last verified prompt: **A3**.
- 2026-09-06 · A4: identity seam + role gate + acting-as picker (Amber ↔
  Ostrava). role-switch.tsx rewired to server actions (decisions, not
  navigation); supplier/funder/ops pages gated via seatGate; layouts
  approach REJECTED after curl proved an RSC-payload data leak — pages gate
  instead, wrong-seat responses re-proven to carry zero data. 35 tests.
  Gates green. Last verified prompt: **A4**.
- 2026-09-06 · A5: the spine went live — submit, approve/refuse, fund,
  disburse, each behind its gate; ConfirmDialog shows the exact entries and
  their Σ before booking; the browser posts only `{invoiceId}` and the server
  recomputes every figure at the consequence. 41 tests. Gates green.
  **THE BOUNDARY TRIGGER FIRED**: `discovery-kit/YOUR_PRODUCT.md` re-audited
  per STACK_RULES.md — real counts (8 pages, 5 tables, 41 tests), the seat
  mechanism documented with its file:line, the three deep modules named, and
  two architectural invariants added as greps (identity read in one place,
  ledger written in one place — both verified holding today). From here,
  cycle 0's output is HOST CODE. Last verified prompt: **A5**.
  Next: Section B (native polish) → C (the five evals) → D (evidence).
- 2026-09-06 · A5 test pass (Chetan: "test your work and fix all issues").
  Added `src/lib/deals/spine.integration.test.ts` — the spine end to end
  against the real database. Seven issues found and fixed; details in
  `docs/product/foundation/develop.md`. The two that mattered: page and
  action disagreed about identity resolution (now one rule,
  `resolvePartyForSeat`), and terms producing a negative margin were
  accepted (now refused with the arithmetic named). 54 tests, four gates
  green, database returns to seeded state after each run.
- 2026-09-06 · Sections B/C/D: the funding dialog reworded so nobody reads
  ops as the funder ("records the funder's capital arriving"); the five
  design evals run for real and exported to `docs/product/foundation/evals.md`
  (5 pass, case 3 hardened because it passed without executing its guard);
  the 8 evidence rows and the final gate written into `develop.md`; manifest
  reconciled against `git diff --name-only main` (55 files). The UI/IA
  revisit is a recorded standing deferral in `docs/product/CYCLES.md`,
  triggered after cycle 4.
- 2026-09-06 · Gap audit (Chetan): five gaps found — CAS race guards added
  to all four transitions; terms now editable until funding per design §3
  (tests 13b/13c); role gate carries a validated returnTo (safeLocalPath,
  open-redirect tested); README.md written; the un-copied rails/verify.ts
  surfaced as a contract deviation and DECIDED by Chetan: deferred to cycle 1,
  amendment recorded in design.md with the reason. 59 tests, gates green.
  Last verified prompt:
  **Section D + gap audit — cycle 0 complete**, awaiting commit.

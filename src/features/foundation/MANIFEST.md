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
  the ES2022 bump — cache, not code). Last verified prompt: **A1**.
  Next: A2 (money + ledger core + state model).

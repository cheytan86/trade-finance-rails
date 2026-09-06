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

## Files modified

- none

## Progress notes

- 2026-09-06 · rails: first commit `9c6bcb4` on `main` (22 docs/process
  files); branch `feat/foundation` cut; no flag by design; manifest + rules
  block created. Last verified prompt: **00 (rails)**. Next: A1.

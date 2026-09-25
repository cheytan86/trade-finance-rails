# Develop — Foundation (cycle 0) · evidence

Single slice (design Part 2: no agent — product track only). Started 2026-09-06.

## Gate 0 — baseline (recorded 2026-09-06, real output)

`STACK_RULES.md` gate section: **no gate commands exist yet** — cycle 0's job
is to create them. The baseline is therefore the audited absence, re-verified
at this gate:

```text
source files (*.ts *.tsx *.js *.sol)   0
package.json                           does not exist
commits                                0  ("branch 'main' does not have any commits yet")
current branch                         main (unborn)
working tree                           11 untracked paths — all documentation/process
src/                                   does not exist
```

Baseline meaning for this phase: "still healthy" = the gate commands that
cycle 0 establishes (`tsc --noEmit · lint · test · build`) go green and stay
green from the prompt that creates them onward, and STACK_RULES.md's gate
section is rewritten with the real numbers. A red gate can never be blamed on
a pre-existing condition — nothing pre-exists.

## Gate 0.5 — contract verification (2026-09-06)

The design replaces the feature-folder/flag/allow-list pattern with a
**created-file map** (NEW-project mode, no host to protect — STACK_RULES.md
boundary mode). Verified line by line:

| Contract line | Verdict | Evidence |
|---|---|---|
| Scaffold paths free (`package.json`, `next.config.ts`, `src/app/…`) | HOLDS | no `package.json`, no `src/` — commands above |
| Data paths free (`drizzle.config.ts`, `src/db/`, `drizzle/`, `scripts/seed.ts`) | HOLDS | no such files/dirs |
| Ledger/money/pricing/rails/roles module paths free | HOLDS | no `src/` |
| Route paths free (`/supplier`, `/ops`, `/funder`, `/pay/[id]`) | HOLDS | 0 `page.tsx` in repo |
| Flag: none — foundation is the host | HOLDS | recorded decision, design §3; no `NEXT_PUBLIC_ENABLE_*` anywhere |
| Env: `DATABASE_URL` slot exists in `.env.example`; no new secrets | HOLDS | `.env.example` lines 21–24 |
| Untouchables: kit folders, other features' docs, `PRODUCT_PAPER.md`, no model key/mainnet | HOLDS | none touched; nothing stages them |
| Git: zero commits; nothing committed without explicit go-ahead | HOLDS | `git log` fatal: unborn branch |

**Discrepancies: none.** One NEW-mode adaptation surfaced for approval rather
than adapted silently: `feat/foundation` cannot be cut from `main` because
`main` has no commits — the rails therefore require the repo's **first
commit** (the 11 documentation/process paths, on `main`), then the branch.

## Smoke path (proposed at Gate 0.5)

Nothing is clickable yet, so the smoke path phases in:

1. From the prompt that creates the scaffold: the app boots and the shell
   renders with the role switch.
2. From the prompt that completes the spine: submit → approve → fund →
   disburse on one invoice, supplier surface shows payment (STACK_RULES.md
   smoke candidate 1).
3. From the same prompt: switch each role and confirm it sees only its own
   surface (candidate 3).

<!-- Sections A–D evidence appended as prompts complete. -->

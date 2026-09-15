<!-- BEGIN:feature-settlement-usdc -->
# Settlement seam + USDC (cycle 1, branch `feat/settlement-usdc`)

Work on this feature is bounded by the integration contract in
`docs/product/settlement-usdc/design.md` — read it and
`src/features/settlement-usdc/MANIFEST.md` at the start of every session,
and re-state the allow-list rather than inferring it from the diff.
Follow `develop-kit/AGENTS.md` for this work.

ENHANCE under the active boundary: additive only; the manifest's 17-file
allow-list is exhaustive; an unnamed modification is a stop-and-ask.

Non-negotiables that survive any session reset: money is bigint minor units
· balances derived, never stored · `src/lib/ledger` is the only writer and
entries sum to zero · the browser posts decisions, never results · identity
is read only through `getIdentity()` · migration 0000 is never edited ·
**no mainnet, ever — the chain id is asserted per call and a wrong id is a
refusal** · private keys live in `.env.local` only: never in git, the
database, client code, or any log · overdue interest follows the pinned
model (supplier +2% charged / funder +2% received, on principal, act/360,
platform keeps the difference, capped at the residual) · commit only on
Chetan's confirmation of a prompt; push only when asked.
<!-- END:feature-settlement-usdc -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

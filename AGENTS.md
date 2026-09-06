<!-- BEGIN:feature-foundation -->
# Foundation (cycle 0, branch `feat/foundation`)

Work on this feature is bounded by the integration contract in
`docs/product/foundation/design.md` — read it and
`src/features/foundation/MANIFEST.md` at the start of every session, and
re-state the boundary rather than inferring it from the diff.
Follow `develop-kit/AGENTS.md` for this work.

NEW-project mode: cycle 0 has **no allow-list and no flag** — the created-file
map in the manifest is the boundary. The moment the spine is clickable end to
end, the boundary trigger in `STACK_RULES.md` fires: cycle 0's output becomes
the host, and `discovery-kit/YOUR_PRODUCT.md` must be re-audited.

Non-negotiables that survive any session reset: money is bigint minor units,
never a float · balances are derived, never stored · entries per movement sum
to zero, enforced in `src/lib/ledger/` which is the only writer · the browser
posts decisions, never results · migrations are never edited after being
applied · no model API, no mainnet, no secret that can cost money · commit
only on Chetan's confirmation of a prompt, never push.
<!-- END:feature-foundation -->

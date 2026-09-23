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

<!-- BEGIN:feature-circle-fiat -->

## Cycle 2 — the fiat rail (Circle sandbox), branch `feat/circle-fiat`

Boundary: `src/features/circle-fiat/MANIFEST.md` is the contract — a 20-file
allow-list plus named new files. ENHANCE with FIX 1. **An unnamed
modification is a stop-and-ask.** Flag `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL`:
absent means off, never an error, and it is checked server-side too — a
public flag is never a permission.

The cycle's own rules, which do not survive being forgotten:

- **`src/lib/domain/states.ts` is untouchable.** In-flight is a display
  condition, not an invoice state. That file staying byte-identical is how
  the claim is verified rather than asserted.
- **In-flight money is never in a balance — by construction, not by filter.**
  Pending legs live in their own table with no `event_id`; `balances()` sums
  `ledger_entries` only. This is precisely why the pending record is not a
  status column on `settlement_events`.
- **A webhook body is a doorbell, never evidence.** Every delivery triggers a
  fresh read of Circle's own record before anything books. Out-of-order
  delivery is therefore designed out, not handled.
- **Fail closed on the webhook route.** Missing or invalid signature,
  malformed body, or flag off → refused and recorded. It is the app's first
  unauthenticated write path and its only credential is the signature.
- **Nothing books unverified**, and a failed leg books *nothing* rather than
  a reversal — money never moved.
- **The human gate is unchanged.** Ops still authorises at the ConfirmDialog
  showing exact entries. The webhook books unattended because ops already
  authorised that movement (Chetan, 2026-09-15) — which is also why nothing
  probabilistic may ever sit on that path.
- Circle's key is server-side, read at request time, never `NEXT_PUBLIC_`,
  **never added to any Vercel scope during Develop**, never echoed.
- Inherited and still binding: money is bigint minor units · balances derived,
  never stored · `src/lib/ledger` is the only writer and entries sum to zero ·
  the browser posts decisions, never results · identity is read only through
  `getIdentity()` · migrations 0000–0004 are never edited · no mainnet, ever ·
  private keys live in `.env.local` only · commit only on Chetan's
  confirmation of a prompt; push only when asked.

<!-- END:feature-circle-fiat -->

<!-- BEGIN:feature-reconciliation-ops -->

## Cycle 3 — reconciliation ops, branch `feat/reconciliation-ops`

Boundary: `src/features/reconciliation-ops/MANIFEST.md` is the contract — a
**nine-file** allow-list plus named new files. ENHANCE with FIX A and FIX B.
**An unnamed modification is a stop-and-ask.** Flag
`NEXT_PUBLIC_ENABLE_RECONCILIATION`: absent means off, never an error, checked
server-side too. **Slice 1 only** (epics A–E); slice 2 is its own Develop run.

The cycle's own rules, which do not survive being forgotten:

- **`src/lib/ledger/index.ts` is READ-ONLY USE.** This cycle adds a new way to
  DECIDE what books, never a new way to book. Any change there is a
  stop-and-ask — it is the single most load-bearing line in the contract.
- **A payment's attribution state is DERIVED, never stored.** `attributed =
  SUM(movements whose evidence_ref = this payment id)`. A status column would
  be a fourth place money state lives, and it would drift. Same rule as
  balances and as `advanceFromBookedLegs`.
- **Only what cannot be derived is persisted** — first-seen-at (aging is
  impossible without it: the rail's `createDate` is when the *bank* moved the
  money, not when we noticed), owner, note. Amount, date and sender always come
  from the rail. Nothing about the money is copied and trusted.
- **The queue is built from the RAIL, never from `webhook_deliveries`.** Proven,
  not preferred: the delivery log's earliest row is 2026-09-18 and two
  unattributed deposits arrived 2026-09-15. A list built from deliveries
  *cannot* contain them, and cycle 2 proved the log can be silently incomplete.
- **A rail that cannot list inbound payments says so.** `usdc` and
  `demo-internal` declare unsupported; an empty list must never read as "no
  money arrived".
- **Ambiguity is parked, never failed, and never guessed.** Two candidates are
  both shown and neither is ranked. Nothing books until a person picks, and the
  basis is recorded — a fixed reason set, because *"ops picked one"* is exactly
  the audit answer this cycle exists to prevent.
- **Never more than what is outstanding, and one payment is spent once.** These
  are two different guards. Before part payments "has this leg settled?" was
  yes/no; with them it is an amount. Both hold **at the server**, not only in a
  disabled button — that is the layer a race can reach.
- **Money is never returned to a sender.** An outbound payout to an account
  with no registered destination, on the say-so of whoever claims the money is
  theirs, is the most attractive thing on this screen to an attacker.
  Unattributable money is parked, not returned.
- **No agent, and it was conceded rather than argued down.** A Circle deposit
  carries nine fields and no free text. Exact `source.id` + exact amount; no
  fuzzy names, no scoring, no model call.
- **Reversals are OUT** — their own cycle, with credit loss. `states.ts` stays
  byte-identical; nothing moves a booked deal backwards.
- Inherited and still binding: money is bigint minor units · balances derived,
  never stored · `src/lib/ledger` is the only writer and entries sum to zero ·
  the browser posts decisions, never results · identity is read only through
  `getIdentity()` · migrations 0000–0006 are never edited · no mainnet, ever ·
  Circle's key is server-side, never `NEXT_PUBLIC_`, never echoed · commit only
  on Chetan's confirmation of a prompt; push only when asked.

<!-- END:feature-reconciliation-ops -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

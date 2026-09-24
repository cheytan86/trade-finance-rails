# Deploy — rail comparison (cycle 4)

Deployed 2026-09-24 from `feat/rail-comparison`, unmerged, behind
`NEXT_PUBLIC_ENABLE_RAIL_COMPARISON`.

**The link** (Vercel truncates and hashes branch names over 63 characters — the
third time on this project, after cycles 1 and 3):

```text
https://trade-finance-rails-git-feat-rail-co-43cfb4-cheytan86s-projects.vercel.app
```

**It is behind Vercel Authentication.** A reviewer needs a bypass link,
generated deliberately.

---

## The settings

```text
Host               Vercel · project trade-finance-rails
Branch             feat/rail-comparison, 10 commits, first pushed 2026-09-24
Alias              hashed (75-char name vs a 63-char limit). A fact, not a
                   fault — and the branch was NOT renamed: the slug is how
                   the phases, the branch and the tracker find each other.
Preview env scope  DATABASE_URL (sensitive) · CIRCLE_API_KEY (sensitive) ·
                   NEXT_PUBLIC_ENABLE_CIRCLE_RAIL ·
                   NEXT_PUBLIC_ENABLE_RECONCILIATION ·
                   NEXT_PUBLIC_ENABLE_RAIL_COMPARISON   ← added at D4
                   Read back from the dashboard by Chetan, not inferred.
Production scope   EMPTY, read back by Chetan
Protection         Standard — inherited from cycle 3's D3 decision, which
                   was the first cycle to turn it on. See finding 1.
New secrets        NONE. This slice makes zero model calls, so D4's
                   "new spend-limited key" has nothing to scope.
```

**The blast radius of this deployment is one public boolean**, and that is worth
stating rather than assuming it carries over:

```text
cycle 2   added a Circle API key and the app's first unauthenticated write path
cycle 3   added a write path over a ledger four previews share
cycle 4   adds a READ-ONLY TABLE
```

## D0 — the gate, re-verified before shipping

```text
commit              7a2174c
npx tsc --noEmit    0 errors
npm run lint        0 problems
npm test            259 tests, 19 files, all passing
npm run build       compiled; 12 routes
evals               5 pass · 0 partial · 0 fail (case 1 hardened against
                    Postgres's own percentile_cont before this was written)
manifest            18 files vs the branch parent; all 9 allow-list items
                    used; every untouchable byte-identical
```

## D1 — the safety scan, across all 72 commits

**A first push publishes history, not files**, so this scan covered every commit
the branch carries — 72 — rather than the 9 it adds.

```text
env files ever tracked        .env.example only. No .env, no .env.local, in
                              any commit, ever.
AWS · Slack · GitHub keys     0
Circle SAND_ key literals     0 — every match is prose, or a regex inside a
                              scan script quoted in the deploy records
sk-ant- · BEGIN PRIVATE KEY   both trace to ONE file: cycle 1's own
                              deploy.md, quoting its scan command back at
                              itself. A record of a scan, not a secret.
0x64-char strings             3, each identified rather than assumed:
                                0xac0974be…  the Anvil account-0 key —
                                             publicly documented, never funded
                                0xaf10ec6f…  Base Sepolia tx hash, public
                                0xfbee46d8…  Base Sepolia tx hash, public
secrets in the 9 new commits  NONE
```

**Nothing to revoke.** The same three strings cycle 3 identified, re-derived
rather than inherited.

## D4 — the flag, and why an empty commit

`NEXT_PUBLIC_*` variables are **inlined at build time**. Adding the flag to the
Preview scope changes nothing on a build that already exists — the deployment
from the first push has the flag compiled in as *absent*.

So the redeploy was triggered with an **empty commit** (`1b5662e`) rather than a
dashboard button, so the history records *why* one build differs from the one
before it:

```text
git diff --stat 7a2174c 1b5662e   →   (empty)
```

**Byte-identical trees. Only the environment differs.** That is the cleanest
possible demonstration of what a `NEXT_PUBLIC_` flag actually is.

Cycle 3 got this same mechanic wrong in the other direction — it blanked a
variable on a flag-*set* build, read the 200 as a flag-off proof, and recorded
that *"the same mistake would look like a passing proof."*

---

## D7 — the three proofs

### 1. The intended audience reaches it — verified by Chetan, 2026-09-24

```text
stage 2 · Pricing      the comparison renders, inside the stage
usdc row               "no settlements yet" — in words, not a zero
the footnote           settlements excluded as impossible, counted
role gate              switching to Supplier and visiting the deal URL
                       directly gives the wrong-seat card, not the table
```

### 2. An unauthorized path is refused — at the platform, before any code

```text
GET /                                     302 → vercel.com/sso-api
GET /ops                                  302
GET /ops/ledger                           302
GET /ops/payments                         302
GET /funder                               302
GET /supplier                             302
GET /api/webhooks/circle                  302
GET /ops  + a FORGED ops cookie           302
```

A forged seat cookie changes nothing: the refusal happens **at Vercel, before
the application runs at all.**

### 3. Production shows nothing

```text
GET https://trade-finance-rails.vercel.app                404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops            404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops/deals      404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops/payments   404 · 107 bytes
```

Checked after **both** pushes. A branch deploy cannot rebuild production: the
Ignored Build Step, **and** `main` carries zero files under `src/`.

---

## What Deploy found

### Finding 1 — Standard Protection is masking a hole that is three cycles old

Proof 2 is stronger than the design asked for. Every path 302s at the platform,
**including with a forged ops cookie.** That is genuinely good.

**It is also hiding something.** Develop's Section D found, against a local
production build, that `seatGate` refuses a *wrong* seat and lets a *missing*
one through:

```text
no cookie    /ops/ledger  200 · 144,664 bytes — the entire ledger
wrong seat   /ops/ledger   12,xxx bytes — the gate card, no data
```

`src/lib/roles/gate.tsx:22` — `if (identity && identity.seat !== required)`.

**On this preview that hole is unreachable, because Vercel refuses the request
first.** Which means:

```text
cycles 0–2   protection OFF → the hole was reachable on every preview
cycle 3      protection ON  → masked
cycle 4      protection ON  → still masked
production   flag off, 404  → not applicable yet
```

**A platform control is compensating for an application one, and the compensation
is invisible.** The moment protection comes off — or the moment any of this
reaches a production domain — the hole is live again. Cycle 1 found it on
2026-09-15 and its decision was "carried to the next session"; three cycles
later `gate.tsx:22` is unchanged. It is now owned by **cycle 4a**, the auth
cycle, and recorded in `CYCLES.md`.

**Not fixed here**, and the reason is the contract: `gate.tsx` is the identity
path and off this cycle's allow-list. This is the second time today that
declining to fix something outside the boundary was the right call — the first
was the role-switcher lag in cycle 3.

### Finding 2 — the stack is five deep and nothing has ever merged

```text
origin holds   feat/foundation · feat/settlement-usdc · feat/circle-fiat ·
               feat/reconciliation-ops · feat/rail-comparison · main
previews       FIVE live
flags in the   NEXT_PUBLIC_ENABLE_CIRCLE_RAIL       cycle 2
Preview scope  NEXT_PUBLIC_ENABLE_RECONCILIATION    cycle 3
               NEXT_PUBLIC_ENABLE_RAIL_COMPARISON   cycle 4
main           1 commit · 22 files · zero under src/
```

Every one of those is a decision with its reasoning on file. **But three flags,
five previews and two un-run teardowns is a state that gets harder to reason
about with each cycle**, and the cost is real: cycle 3's Deploy already recorded
that the cycle-2 preview's webhook books into the shared database, so a payment
can vanish from another preview's queue with nothing on that preview having
done it.

### Finding 3 — the cycle-2 webhook is still live, verified today

```text
56709d33-e17c-45bc-aa1d-5ce1b976fd08
  → …git-feat-circle-fiat-…/api/webhooks/circle
  → status: confirmed, confirmed
```

Read from `GET /v1/notifications/subscriptions` at D-1, not recalled. Created
in cycle 2. Cycle 2's teardown did not run; cycle 3 inherited it and did not run
either. **It has now outlived two teardowns and three cycles.**

### Finding 4 — an assumption in my own audit, corrected by the read-back

The D-1 audit stated that `NEXT_PUBLIC_EXPLORER_URL` was already in the Preview
scope. Chetan's dashboard read-back shows four variables and it is not among
them.

**Harmless** — `rail-comparison.tsx:27` and `usdc.ts:28` both carry a hard-coded
Base Sepolia fallback, so the Basescan link resolves either way. **Recorded
anyway**, because an assumption that turned out false is worth more in a record
than a fact that happened to be right.

---

## D9 — teardown, and a trigger with an OWNER this time

**Nothing is torn down yet.** This preview is the demonstration of the
product's headline claim, and that claim has never been shown to anyone.

When it runs, for this cycle:

```text
1. remove NEXT_PUBLIC_ENABLE_RAIL_COMPARISON from the Preview scope
2. no key to revoke — this phase created none
```

### And the two teardowns this project is carrying

```text
CYCLE 2   Circle webhook subscription 56709d33 — LIVE, verified 2026-09-24
          NEXT_PUBLIC_ENABLE_CIRCLE_RAIL in the Preview scope
          wire accounts fbf1313c and b5ac0172 — PERMANENT, no delete
          endpoint, they outlive every teardown

CYCLE 3   NEXT_PUBLIC_ENABLE_RECONCILIATION in the Preview scope
```

**Their trigger is named here with an owner, rather than as "when the purpose is
served".** That phrasing is exactly what let them survive three cycles, and
today produced the standing lesson recorded in `CYCLES.md`: *"carried to the
next session is where findings go to disappear."*

**The owner: cycle 2's next `/release` run.** Its R0 condition was re-stated on
2026-09-24 to *"revisited when cycle 3 is closed"*, and cycle 3 closed the same
day — so that R0 is now unblocked and is the next moment someone will be looking
at cycle 2's deployment on purpose. Whatever it decides, go or no-go, the
webhook and the flag are settled in the same session.

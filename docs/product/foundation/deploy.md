# Deploy — Foundation (cycle 0)

Date: 2026-09-07 · Deployed by: Chetan (dashboard) + companion (CLI/verification)

## The link

**https://trade-finance-rails-git-feat-foundation-cheytan86s-projects.vercel.app**

Stable branch alias — it follows `feat/foundation` and moves only when that
branch is pushed. Per-deploy URLs (hash-suffixed) exist beside it; the alias
is the one to share. Source: https://github.com/cheytan86/trade-finance-rails
(public, PolyForm Noncommercial 1.0.0, first pushed 2026-09-07).

## What is deployed

The cycle-0 foundation, preview deployment of the **unmerged** branch
`feat/foundation` at commit `84c6d69` (build: 32s, Vercel). This is a preview
of an unmerged branch — **not production**; the register stays honest.

## Settings, as read back from the dashboard

- **Env:** `DATABASE_URL` is the ONLY variable in the project, scoped to
  **Preview only** (read back by Chetan). Production and Development scopes:
  empty. No model key exists in this product (recorded decision); the Circle
  sandbox key was never added.
- **Deployment Protection:** Vercel Authentication disabled 2026-09-07 —
  verified over the wire (302 → 200 transition on the stable alias).
- **Ignored Build Step:** main skips builds (`main` is documentation-only
  and cannot build — its single 2s error deployment predates the guard).
- **Framework preset:** selected manually (Next.js) — auto-detection
  inspects the default branch, and `main` carries no `package.json`.

## The three proofs (D7), run over the public internet 2026-09-07

```text
PROOF 1 — the audience reaches the feature:
  GET /                    → 200, "One deal, four pairs of hands."
  GET /ops/ledger (ops)    → live Neon data: 10× "derived, never stored",
                             10× demo-internal evidence badges
  GET /pay (no cookie)     → the public invoice payment page serves

PROOF 2 — the unauthorized path is refused:
  GET /supplier with a funder cookie → the role-gate card only;
  ZERO occurrences of any book amount in the entire response body
  (the RSC-payload leak class was found and fixed in Develop; re-proven
  against the live deployment)

PROOF 3 — production shows nothing:
  https://trade-finance-rails.vercel.app → 404 (no production deployment
  exists; production env scope empty)
```

## Notes for the record

- **Near-miss, no harm done:** the whole `.env.local` was pasted into
  Vercel's env screen, which auto-split it into 9 keys including the Circle
  sandbox key; caught at read-back and reduced to `DATABASE_URL` before
  anything sensitive reached a deployment. Lesson recorded: never paste an
  env file whole into a host dashboard.
- **The demo is publicly writable by design** (synthetic data, server-side
  recomputation, no secret that can spend). Remedy for noisy data:
  `node scripts/seed.mts` locally against the same Neon database.

## Teardown

Deliberately **not scheduled**: this deployment *is* the product's public
demo — its purpose is ongoing, not served-and-done. Standing teardown, when
ever needed: remove `DATABASE_URL` from the Preview scope, re-enable
deployment protection, delete the Vercel project; nothing else exists to
revoke (no phase key was ever created — no model API in this product).
Revisit at Release, which also owns the merge decision. Branch stays
unmerged until then.

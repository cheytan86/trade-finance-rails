# Deploy — Fiat rail (Circle sandbox, cycle 2)

> **IN PROGRESS — written at D5–D7, 2026-09-18.** All three D7 proofs are
> recorded. What remains is blocker 1 (the Circle webhook subscription, which
> is what makes an unattended settlement possible at all) and the D9 teardown.
> Do not read this as a completed phase record.

Date: 2026-09-18 · Audit: `deploy-kit/YOUR_DEPLOYMENT.md` (rebuilt for this
feature at D-1; cycle 1's audit is superseded and lives in
`docs/product/settlement-usdc/deploy.md`).

**This phase is NOT retroactive.** Unlike cycle 1, no ad-hoc preview was made
during Develop. The branch was pushed here, for the first time, after the
history scan — which is the order cycle 1's record wished for.

## The link

**https://trade-finance-rails-git-feat-circle-fiat-cheytan86s-projects.vercel.app**

Stable branch alias — it follows `feat/circle-fiat` and moves on every push to
that branch. Preview of an **unmerged** branch at commit `5026d25`; this is
not production, and the register says so.

Unlike cycle 1, the branch name is short enough for a readable alias rather
than Vercel's hashed form.

## D0 — the gate, re-verified before shipping

```text
commit              5026d25
npx tsc --noEmit    0 errors
npm run lint        0 problems
npm test            179 tests, 16 files, all passing
npm run build       compiled; 9 routes
manifest            reconciles against git diff vs feat/settlement-usdc,
                    with two undeclared changes recorded, not absorbed
evals               4 pass · 1 partial · 0 fail (docs/.../evals.md)
```

## D1 — the safety scan, and this time it came first

Cycle 1 ran its history scan retroactively, because the branch was already
public. Cycle 2's branch had never been pushed, so **this scan was the real
guard rather than a record of one**. All 13 commits, not just the working tree:

```text
.env ever tracked, any branch    .env.example only (template, values blank)
0x + 64 hex literals             0
SAND_ key literals               0
PEM private-key blocks           0
postgres:// connection strings   0
.replay-key.pem ever tracked     0
real personal data               none — every party is an invented company
```

## D5 — the push, and what it did not do

```text
pushed                  feat/circle-fiat → origin, 13 commits, 0 unpushed
origin/main             9c6bcb4 — UNCHANGED (the cycle-0 repo baseline)
repo visibility         public, unchanged (public since 2026-09-07)
production deployment   not triggered
```

## D7 proof 1 — the flag off, on the real host

The first build was made deliberately **without** the flag and **without** the
Circle key, so that "absent means off, never an error" could be demonstrated
on the platform rather than only on a laptop. Run against the public URL,
2026-09-18 09:27 UTC:

```text
POST /api/webhooks/circle          404  "fiat rail disabled"
circle-fiat options rendered         0
/                                  200
/ops                               200
/ops/ledger                        200
/supplier                          200
/funder                            200
```

The webhook door is the one that matters. It is a public, unauthenticated
write path by design, and with the flag absent it refuses before reading a
byte of the body.

**One detail worth recording, because it looks like a contradiction and is
not.** With the flag off, an existing fiat deal still renders its rail
correctly:

```text
/ops/deals/61fc99df…   200
rail label rendered    "Fiat · Circle sandbox (no real money)"
```

The flag gates whether the rail can be **offered**, not whether existing deals
are **described** accurately. A deal already settled on Circle is still a
Circle deal, and saying otherwise would be a lie of exactly the kind cycle 2
spent a day removing — before this cycle's display fix, that line would have
read "demo-internal".

## D7 proof 3 — production shows nothing

```text
GET https://trade-finance-rails.vercel.app       404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops   404 · 107 bytes
```

Production remains dark: `main` builds are skipped by the Ignored Build Step
decision from cycle 0, and the Production env scope holds nothing — neither
the flag nor any Circle key.

## D6 — the rebuild, and the flag proving it was the control

The first build carried no flag and no key, on purpose. Chetan then scoped
both to the Preview environment pinned to `feat/circle-fiat`, and the branch
was rebuilt (`bc7a133`, an empty commit — the alias follows the branch, so a
push is a rebuild).

**The same request, before and after, against the same public URL:**

```text
before   POST /api/webhooks/circle   404  "fiat rail disabled"
after    POST /api/webhooks/circle   403  "signature refused"
```

404 means the feature does not exist on this host. 403 means it exists, it
read the signature on an unsigned body, and refused. Nothing in the source
changed between those two responses — only an environment variable scoped to
one branch. That single digit is the flag demonstrating it was the control,
not a courtesy.

## D7 proof 2 — the unauthorized path is refused

Run against the live preview, 2026-09-18 09:31 UTC, over the public internet:

```text
no signature at all           403  signature refused
bogus signature + key id      403  signature refused
X-Circle-Key-Id: local-replay 403  signature refused
```

The third is the one worth reading twice. `local-replay` is the key
`scripts/replay-circle-webhook.mts` signs with — the development affordance
that made this cycle's asynchronous path testable on a laptop at all. In
production it is refused outright (`circle-signature.ts:59-60`), so the
preview cannot be driven by the tool that drove every settlement in this
cycle's life. That is by design, and it is half of blocker 1 confirmed on the
host rather than asserted from a test.

The rail is offered, on a deal that renders the pricing step:

```text
<option value="circle-fiat">Fiat · Circle sandbox (settles later)</option>
```

and every host surface still answers 200.

## Still to do

```text
D4   DONE — both variables scoped to Preview / feat/circle-fiat. Scope
     read-back from Chetan still outstanding as a written confirmation.
D6   DONE — rebuilt at bc7a133; the 404→403 transition is the evidence.
D7   proofs 1, 2 and 3 all recorded above.
BLOCKER 1 — register the Circle webhook subscription against this URL. Until
     it exists, no leg can settle unattended: Circle has never been told where
     to deliver, and the replay key is refused in production. Every settlement
     in this cycle's life has been prompted by a human, either a local replay
     or a Check-status press. THE FIRST UNATTENDED SETTLEMENT THIS PRODUCT HAS
     EVER MADE would be the thing this deployment exists to demonstrate.
D9   teardown: remove the scoped key and flag, revoke the phase key at Circle,
     REMOVE THE WEBHOOK SUBSCRIPTION (or Circle keeps delivering to a dead
     URL), and record the date. The branch stays unmerged either way.
```

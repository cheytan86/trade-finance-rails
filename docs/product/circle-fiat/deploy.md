# Deploy — Fiat rail (Circle sandbox, cycle 2)

> **D-1 through D8 complete, 2026-09-18. D9 teardown is NOT done** — the
> scoped key, the flag and the Circle webhook subscription are all still live,
> and the subscription in particular must be deleted or Circle keeps
> delivering to a dead URL. Teardown is scheduled, not skipped: its trigger is
> named at the end of this file.

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

## What Deploy found, and only Deploy could have

**The signature scheme this cycle shipped could never have accepted a real
Circle notification.**

Within minutes of the subscription existing, Circle called the endpoint three
times. All three were refused:

```text
09:37:21  SubscriptionConfirmation   refused-signature
09:37:22  SubscriptionConfirmation   refused-signature
09:50:12  Notification (deposits)    refused-signature   ← a real funding leg
```

**Why.** Circle Mint delivers through Amazon SNS. The HTTP request is made by
SNS, not by Circle, so there is **no `X-Circle-Signature` header on it at
all**. SNS signs a canonical string built from named fields of the parsed
body, with an RSA key whose X.509 certificate is named by `SigningCertURL`.
The header scheme, read from Circle's docs at A5 and implemented faithfully,
describes a delivery that never arrives.

Every local test passed because `scripts/replay-circle-webhook.mts` signs the
header way. It tested the code faithfully against the wrong contract — and no
amount of local testing could have revealed that, because Circle cannot reach
a laptop. **This is the entire argument for the Deploy phase existing, in one
defect.**

**What survived the discovery, and it is the important part.** The refusals
were SAFE. Nothing unverified was booked, every refusal was recorded with its
raw body, and the in-flight funding leg kept its durable row — so nothing was
lost, only unfinished. A2's rule held: the body is a doorbell, never evidence.

**The fix (commit `25adc21`).** Verification now dispatches on what the
delivery actually carries. Header-signed deliveries verify against raw bytes
as before; SNS envelopes verify against the canonical string SNS signed, which
can only be built *after* parsing. That inverts scheme A's ordering and does
not weaken it: nothing is ACTED ON before verification holds either way. The
SSRF argument is extended rather than repeated — `SigningCertURL` is a URL
that arrived in a request body, exactly like `SubscribeURL`, so it passes the
same host guard before anything is fetched.

Proved against the three real refused deliveries, which now all verify, and
pinned by 14 new tests (193 total) covering the field ORDER SNS signs in — the
thing that verifies nothing and looks exactly like a forged signature when
wrong.

## D7 proof 4 — a deal settles end to end, on the public internet

Invoice `ec8e7dc2`, face 18,200.00, five legs on `circle-fiat`, carried
through the deployed preview by Chetan:

```text
deal status                     settled
client_collections                  0.00      a conduit, never a beneficiary
debtor_cash · Halvorsen       −18,200.00      face, exactly
funder_cash · Northgate           +195.95      their return
platform_operating                +186.74      the spread
supplier_payable · Amber       +17,817.31      18,200 − 195.95 − 186.74
```

**How each leg actually finished, recorded precisely rather than summarised
favourably:**

| leg | finished by |
|---|---|
| funding | Check status — after the SNS defect refused Circle's notification |
| disbursement | the gate request — Circle's payout had already completed |
| repayment | a verified delivery, but see the ambiguity below |
| **payout** | **a verified delivery, unattended** |
| residual | the gate request — Circle's payout had already completed |

**The payout is the one that proves the claim**, and it is worth the detail:

```text
10:07:08   observed: payout row `initiated`, nothing booked, 13 deliveries
10:07:28   payout BOOKED
10:07:29   delivery recorded — valid=true, resolved to the payout row
           new deliveries during the window: exactly 1
```

Between an observation of an unbooked leg and the booking twenty seconds
later, exactly one thing happened: a Circle notification, over the public
internet, verified against Amazon's certificate, matched to that leg, booked.
Nobody was on the page. **That is the first settlement this product has
completed with no human involved** — the claim cycle 2 exists to make, which a
laptop cannot demonstrate, verified by code written ninety minutes earlier in
response to finding out in production that the scheme was wrong.

**And the rail turns out to be genuinely mixed-mode.** Some legs complete
inside the request, some minutes later by callback, and the deal reaches the
same correct state either way — because both paths run `completeSettlement`
and neither trusts the message. A2's single-booking-path design exercised for
real rather than asserted.

## The findings this deployment produced

1. **`applied` cannot distinguish "I booked this" from "this was already
   booked".** `completeSettlement` returns `settled` in both cases and the
   route labels both `applied`. Worse, `webhook_deliveries.received_at` is
   populated when the row is written — AFTER the booking — so it is a
   recorded-at, not a received-at, and a delivery that books something always
   appears to arrive after the thing it caused. Together these mean **the
   system cannot prove, from its own records, whether money was booked by a
   webhook or by a human.** For a product whose headline claim is unattended
   settlement, and whose ledger is meant to be auditable, that is a real gap.
   It is why the repayment above is recorded as ambiguous. **Fix before
   Release.**

2. **A refused delivery is never retried into success.** SNS gave up on the
   09:50 notification; it never came back after the fix deployed. So a wrong
   verifier loses notifications permanently rather than queueing them. The
   only reason nothing was lost here is `checkSettlementStatus`, which
   re-reads the rail's record instead of waiting to be told — A2's design
   earning its keep in a scenario nobody designed it for.

3. **An open page never learns that money moved.** `revalidatePath` invalidates
   the server's cache; it does not push to a tab already open. On immediate
   rails this could not arise. On a deferred rail, someone is watching a screen
   while the thing they are waiting for happens elsewhere. *Cycle 3.*

4. **The SNS handshake cannot be completed by the endpoint alone** until the
   verifier change is exercised on a fresh subscription. This one was confirmed
   by hand, applying the same Amazon-host guard the route applies. Every new
   subscription needs that until proven otherwise — a small recurring tax, and
   the reason this is a named item at R0 rather than a footnote.

## D9 — teardown, scheduled with its trigger

**Trigger: when the preview's purpose is served** — that is, when Release has
taken its R0 decision on cycle 2, or when the branch is superseded by cycle 3,
whichever comes first.

```text
[ ] delete the Circle webhook subscription 56709d33-e17c-45bc-aa1d-5ce1b976fd08
    — DO THIS FIRST, or Circle keeps delivering to a URL that has stopped
      answering, and the deliveries are simply lost
[ ] remove CIRCLE_API_KEY from the Vercel Preview scope
[ ] remove NEXT_PUBLIC_ENABLE_CIRCLE_RAIL from the Vercel Preview scope
[ ] revoke the phase API key at Circle (the local .env.local key stays)
[ ] record the teardown date here
```

The branch stays unmerged either way.

## Outstanding

```text
Scope read-back from Chetan as a written confirmation (names and scopes only).
The flag and key are demonstrably live — the 404→403 transition and five
booked legs prove it — but the dashboard state itself has not been read back.
```

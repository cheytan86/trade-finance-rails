# Deploy — reconciliation ops, slice 1

Deployed 2026-09-24 from `feat/reconciliation-ops`, unmerged, behind
`NEXT_PUBLIC_ENABLE_RECONCILIATION`.

**The link** (Vercel truncates and hashes branch names over 63 characters, as
it did for cycle 1):

```text
https://trade-finance-rails-git-feat-reconci-9d4645-cheytan86s-projects.vercel.app
```

**It is behind Vercel Authentication.** A reviewer needs a bypass link,
generated deliberately. See the D3 decision below — that is a change from
cycles 0–2, taken rather than inherited.

---

## The settings

```text
Host               Vercel · project trade-finance-rails
Branch             feat/reconciliation-ops, 15 commits, pushed 2026-09-24
Alias              hashed (67-char name vs a 63-char limit) — a fact, not a
                   fault. The branch was NOT renamed: the slug is how the
                   phases, the branch and the tracker find each other.
Preview env scope  DATABASE_URL (sensitive) · CIRCLE_API_KEY (sensitive) ·
                   NEXT_PUBLIC_ENABLE_CIRCLE_RAIL · NEXT_PUBLIC_ENABLE_RECONCILIATION
                   — the two flags plain, because NEXT_PUBLIC_ is compiled into
                   the browser bundle and marking it "sensitive" would hide it
                   from the operator while leaving it visible to every visitor.
Production scope   EMPTY, read back by Chetan
Protection         Standard — every preview requires a Vercel login;
                   production left open, which changes nothing since it
                   returns 404
New secrets        NONE. This slice makes no model calls, so D4's
                   "new spend-limited key" does not apply. Inventing one
                   would have been ceremony rather than safety.
```

## D3 — the decision that was re-taken, not inherited

**Deployment Protection is ON.** Cycle 0 chose OFF, because *"a portfolio demo
behind SSO is invisible"*, and cycles 1 and 2 inherited that.

**Cycle 3 is the first slice where the link lets a stranger move money** —
sandbox funds, but real entries in the ledger the local dev server also reads,
because the preview shares the development database. Off was defensible while
the preview was read-mostly. It is not defensible for a write path over a
shared book.

The cost is real and is recorded rather than glossed: with protection on, an
unauthenticated request cannot distinguish "the route exists" from "the flag
is off" — everything returns 302. **The flag-off proof therefore had to be
taken on a local production build instead**, and it was, at Develop's Section D.

## D7 — the three proofs

### 1. The intended audience reaches it — verified by Chetan, 2026-09-24

```text
/ops                     the "Money received" card shows ≈ $59,000
/ops/payments            THREE cards: the fiat table, plus demo-internal and
                         USDC each carrying their reason for having nothing
fiat table               24 rows, 11 unattributed
a payment                opens on "What could this be for?"
role gate                switching to Supplier and visiting /ops/payments
                         directly gives the wrong-seat card, not the queue
```

### 2. An unauthorized path is refused — and earlier than designed

```text
GET /                                     302 → vercel.com/sso-api
GET /ops                                  302
GET /ops/payments                         302
GET /ops/payments/99bea655-…              302
GET /api/webhooks/circle                  302
GET /ops/payments  + forged ops cookie    302
```

The refusal happens **at the platform, before any application code runs**. A
forged seat cookie changes nothing. That is stronger than the design asked
for — `seatGate` is now the second line rather than the only one.

### 3. Production shows nothing

```text
GET https://trade-finance-rails.vercel.app            404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops        404 · 107 bytes
GET https://trade-finance-rails.vercel.app/ops/payments 404 · 107 bytes
```

Identical before and after both pushes. A branch deploy cannot rebuild
production: the Ignored Build Step, **and** `main` carries zero files under
`src/`.

---

## What Deploy found

### Finding 1 — a click on a money screen showed two seconds of nothing

**Chetan, using the preview:** *"the application feels slow, when i click it
takes about 2 seconds with no reload shown on the screen."*

Measured rather than guessed:

```text
loading.tsx files in the whole application    0
Suspense boundaries                           0
```

A server component renders **nothing** until it has everything, and these pages
wait on Circle. Locally that is 0.4–0.6 s and invisible. On Vercel, cold, it is
two seconds with the previous page still on screen — so the click looks
ignored.

**This was a gap named at Section B and not closed.** That prompt reads *"the
states nobody designed: empty lists say what they mean, LOADING IS VISIBLE,
errors are sentences."* The empty lists were done and an entire third state was
built for errors. Loading was skipped. **The same shape as the unreachable
branch at B1: described, then left.** It took a real host to reveal it, which
is what Deploy is for — cycle 2 found two of its eight defects the same way.

**It matters more on this screen than most.** A money screen where a click
appears to do nothing is how people double-click, and double-clicking an
attribution is precisely the race the server-side refusal exists for. The
refusal would have held; the person would still have been surprised.

**Fixed, in two parts.** `loading.tsx` for both payment routes, in host
vocabulary with nothing animated — a spinner would be a new idiom and the page
arrives inside a second. And the money-received card on `/ops` extracted into
its own component behind a Suspense boundary, because it is the only thing on
the deal book making a network call and fetching it inline made the busiest
screen in the product wait on Circle before drawing a row.

No `loading.tsx` was added at `/ops`, deliberately: that would change how an
existing host screen behaves for content this cycle did not build.

### Finding 2 — the role switcher lags, and it is NOT this cycle's

**Chetan:** *"when i click on the roles… there i see lag… it does not feel
instantaneous."*

One seat click is **two full server round-trips with a database query between
them**, and the control is a plain form submit with no pending state, so it
looks dead throughout:

```text
1. POST → switchSeat server action
2. a database query (supplier and funder resolve a party id)
3. sets the identity cookie
4. redirect() to the seat's home
5. the browser follows — a SECOND round-trip renders the page

landing pages, measured locally:
  /supplier 0.23 s · /ops 0.70 s · /funder 0.17 s · /pay 0.09 s
```

**Pre-existing since cycle 0's A4, and deliberately NOT fixed here.**
`role-switch.tsx` and `roles/actions.ts` are off this cycle's allow-list and
the second is the identity path. The fix is one line of `useFormStatus`, and
that is exactly why it was declined: once improvements start landing outside
the boundary, the boundary stops meaning anything.

**It already has a home.** `CYCLES.md` carries a standing deferral — *"the UI
and information architecture revisit… revisit after cycle 4"*. A switcher with
no pending feedback is that work.

The distinction between these two findings is worth keeping: **one is a defect
this slice shipped; the other is a pre-existing limit the host revealed.**

### Finding 3 — the preview receives no webhooks, and the old one still books

Subscription `56709d33-e17c-45bc-aa1d-5ce1b976fd08` still delivers to the
`feat/circle-fiat` preview. So:

- Nothing settles automatically on the new preview. "Check status" is the only
  automatic path; manual attribution — the feature under test — works.
- The **old** preview keeps booking into the shared database, so a payment can
  disappear from the new queue with nothing on the new preview having done it.
  **This is the eval's webhook race in production form**, expected rather than
  surprising.

### Finding 4 — payment instructions in a public repository

Raised at D1. The repo has been public since 2026-09-07 and this branch adds
Circle tracking references and Virtual Account Numbers to `CYCLES.md` and the
design file — *"send money to this account number"*, in public.

**Not redacted**, deliberately: the runbook has carried the same identifiers
publicly since cycle 2, so the marginal exposure is near zero, and stripping
them would gut the evidentiary specificity those documents exist for. In
sandbox the worst outcome is a stranger creating mock deposits that appear in
the queue as noise.

**The rule is the fix**, and it is now standing in `STACK_RULES.md`: a
production tracking reference, VAN, IBAN, sort code or account number never
enters this repository, public or private.

**Making the repo private was considered and set aside.** It protects the
future, not the past — forks, clones and caches already hold the history — it
costs the project its purpose, and it hides nothing actually exposed, since
the previews are reachable either way. Privacy becomes right when this stops
being a demonstration.

---

## The safety scan (D1)

```text
52 commits scanned · 15 new on this branch
env files ever tracked        NONE, in any commit
Circle key patterns (SAND_)   0
AWS / Anthropic / PEM keys    0
0x64-character strings        3, each identified rather than assumed:
    the Anvil account-0 test key (publicly documented, never funded — the
    file's own comment says so) and two Base Sepolia transaction hashes,
    which are public chain data
```

Nothing to revoke.

## The gate at deploy time

```text
tsc 0 · lint 0 · 237 tests across 18 files · build ✓ 12 routes
evals 5 pass · 0 partial · 0 fail
```

## Deploy blocker cleared at D2

`listInbound()` had **no timeout anywhere beneath it** — `circle-client.ts`
calls `fetch` with no `AbortSignal`. A dead rail fails in milliseconds; a
**slow** one would have hung the ops deal book until the serverless function
itself timed out, showing nothing at all.

The first test of this was not good enough: a dead hostname returned in 25 ms
and looked like proof. DNS had failed instantly. Re-tested against a
black-holed address:

```text
returned in 4011 ms · status=unreachable
"We could not reach this rail to ask what has arrived — no answer within 4s"
```

4 seconds against measured answers of 0.47–0.65 s. Fixed in `queue.ts` rather
than the HTTP client — the tolerance belongs to the screen, not the client. A
page decides how long it will wait.

---

## Teardown — NOT run, and the trigger

**Nothing is torn down yet**, because the deployment's purpose is not served:
slice 2 is unbuilt and Release has not been revisited.

When it runs, three things:

```text
1. remove NEXT_PUBLIC_ENABLE_RECONCILIATION from the Preview scope
2. the Circle webhook subscription 56709d33-e17c-45bc-aa1d-5ce1b976fd08 —
   STILL LIVE, still pointing at the cycle-2 preview, and inherited from
   cycle 2's own un-run teardown
3. wire bank account b5ac0172 (CIR3YJPTAG) is PERMANENT — Circle exposes no
   delete endpoint for it. It outlives every teardown.
```

**No phase key was created, so none needs revoking.** The Circle sandbox key
is cycle 2's and stays until that cycle's teardown.

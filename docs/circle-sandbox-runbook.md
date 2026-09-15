# Circle sandbox runbook — cycle 2, build step A0

Mirrors `docs/demo-wallets-runbook.md`: the manual setup a fresh machine (or a
fresh reader) needs, written down so it is not rediscovered mid-cycle.

**Everything here is the Circle *sandbox*.** The key is `SAND_`-prefixed and
cannot move real money (`STACK_RULES.md:182-184`). No real company, no real
person, no real bank account. Nothing in this file may claim production
capability — the sandbox returns 200 on every product surface, which is the
sandbox being permissive, not proof the same products are enabled in
production (`STACK_RULES.md:199-202`).

---

## What already exists (verified 2026-09-04, recorded in STACK_RULES.md)

```text
Base URL   https://api-sandbox.circle.com
Console    https://app-sandbox.circle.com/developer → API Keys
Key        CIRCLE_API_KEY in .env.local (gitignored). NEVER in any Vercel
           scope during Develop. Never echoed, never logged.

GET /v1/configuration                → 200, masterWalletId returned
GET /v1/businessAccount/balances     → 200, available [] unsettled []
GET /v1/businessAccount/banks/wires  → 200, [] — no wire account registered
```

**So the account is live but empty**, with nothing to pay out to. That is what
A0 fixes.

## Step 1 — confirm the key still works

```bash
curl -s https://api-sandbox.circle.com/v1/configuration \
  -H "Authorization: Bearer $CIRCLE_API_KEY" | head -c 400
```

Expect a JSON body containing `masterWalletId`. A 401 means the key was
rotated — get a new one from the console and replace it in `.env.local` only.

> The `masterWalletId` is deliberately **not** recorded in any tracked file.
> It is account-specific, it is not a secret, and `/v1/configuration` returns
> it on demand (`STACK_RULES.md`).

## Step 2 — register a test wire bank account

The three outbound legs (disbursement, payout, residual) pay a bank account,
and there is none registered. In the sandbox Circle publishes test bank
details for exactly this.

**Read the current shape from Circle's docs before posting** — the request
body for `POST /v1/businessAccount/banks/wires` (account number vs IBAN,
billing details, the test account numbers Circle designates) is Circle's to
define and has changed across their API versions. Do not take it from memory,
including mine.

After it succeeds, re-run the read and record the returned bank id:

```bash
curl -s https://api-sandbox.circle.com/v1/businessAccount/banks/wires \
  -H "Authorization: Bearer $CIRCLE_API_KEY"
```

The bank id goes into the `settlement_destinations` table as an
`external_id` — **the API key never does**.

## Step 3 — fund the sandbox balance

Payouts need a balance. In the sandbox this is done by simulating an inbound
wire to the business account's deposit instructions, which is also **the
capability question this cycle depends on** (see Step 4).

```bash
curl -s https://api-sandbox.circle.com/v1/businessAccount/balances \
  -H "Authorization: Bearer $CIRCLE_API_KEY"
```

Expect `available` to become non-empty. Until it does, every payout will fail
for a reason that has nothing to do with our code.

## Step 4 — THE CAPABILITY QUESTION, answered here and recorded

**Two of the five legs are money coming *in*** — funding (the funder pays the
platform) and repayment (the debtor pays the platform). They need the sandbox
to simulate an **inbound wire**. Whether it can, and by which route, is the
one thing cycle 2's design deliberately did not guess.

Record the answer in `STACK_RULES.md` and in this file:

```text
[ ] Inbound wire simulation available?        yes / no
[ ] Route used:                               ..............................
[ ] Webhook fired on the simulated deposit?   yes / no
[ ] Time from simulation to webhook:          ......
```

**If yes:** all five legs run on the fiat rail and cycle 2 delivers a complete
all-fiat mode.

**If no:** stop and raise it with Chetan before A1 — it is a scope
conversation, not an improvisation. The likely shape is that the three
outbound legs run on the fiat rail and the two inbound ones stay on
`demo-internal` for now, with the deal page saying so plainly. That is still a
real asynchronous rail and still completes the cycle's actual subject, but it
is **not** a complete all-fiat mode and must not be described as one.

## Step 5 — the webhook subscription

Circle must be told where to deliver. The endpoint is
`/api/webhooks/circle` on the **preview deployment** — Circle cannot reach
`localhost`, which is why cycle 2 builds a signed local replay script instead
(Chetan's decision, 2026-09-15).

**Read Circle's current notification docs for the signature scheme before
writing the verifier.** If they use an ECDSA public key fetched from their
API rather than a shared secret, `CIRCLE_WEBHOOK_SECRET` in `.env.example`
becomes a public-key variable. That is a naming change, not a structural one,
and the design does not guess it.

```text
[ ] Signature scheme:              shared secret / ECDSA public key / other
[ ] Env var name settled:          ..............................
[ ] Subscription endpoint URL:     ..............................
```

## Standing constraints

- The API key is server-side, read at request time, never `NEXT_PUBLIC_`,
  **never added to any Vercel scope during Develop**, never echoed into a
  terminal or a log.
- Destination ids (bank id, wallet id) are not secrets and may be stored.
  Credentials are not, and never go in the database — the same rule
  `src/lib/rails/wallets.ts` states for key material.
- Client money never shares an account with platform funds
  (`docs/product/CYCLES.md`, standing rule from cycle 2 onward).

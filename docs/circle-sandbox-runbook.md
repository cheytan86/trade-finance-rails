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

## Step 2 — register a test wire bank account — DONE 2026-09-15

The three outbound legs (disbursement, payout, residual) pay a bank account.
Circle publishes sandbox test values for this: account `12340010`, routing
`121000248`.

```bash
curl -s -X POST https://api-sandbox.circle.com/v1/businessAccount/banks/wires \
  -H "Authorization: Bearer $CIRCLE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "<a fresh uuid>",
    "accountNumber": "12340010",
    "routingNumber": "121000248",
    "billingDetails": { "name": "Trade Finance Rails (sandbox)", "city": "Boston",
      "country": "US", "line1": "100 Money Street", "district": "MA",
      "postalCode": "02108" },
    "bankAddress": { "bankName": "SAN FRANCISCO", "city": "SAN FRANCISCO",
      "country": "US", "line1": "100 Money Street", "district": "CA" }
  }'
```

Result: **200**, and Circle resolves the routing number itself — the account
comes back as `WELLS FARGO BANK, NA ****0010`, `status: pending`, and reaches
`status: complete` within seconds. Re-read it with a plain GET on the same
path.

```text
[x] Registered 2026-09-15 · trackingRef CIR2NV7EX2 · status complete
```

The bank id and trackingRef are account-specific identifiers, not secrets, and
both are retrievable on demand — so, like the masterWalletId, they are not
committed anywhere they would go stale. **The API key never leaves the
environment.**

## Step 3 — fund the sandbox balance — DONE 2026-09-15

Payouts need a balance. In the sandbox you simulate an inbound wire.

**THE TRAP, AND IT COSTS A 400 WITH NO MESSAGE.** `beneficiaryBank.accountNumber`
is **Circle's receiving account**, not the account you registered in step 2.
Sending `12340010` returns `{"code":-1,"message":"Something went wrong"}` at
every amount, with nothing to indicate which field is wrong. Get the right
number from the wire instructions first:

```bash
curl -s https://api-sandbox.circle.com/v1/businessAccount/banks/wires/<bank-id>/instructions \
  -H "Authorization: Bearer $CIRCLE_API_KEY"
```

That returns Circle's own beneficiary bank — Standard Chartered, and an
`accountNumber` (ours: `11001233428`). Use **that** one:

```bash
curl -s -X POST https://api-sandbox.circle.com/v1/mocks/payments/wire \
  -H "Authorization: Bearer $CIRCLE_API_KEY" -H "Content-Type: application/json" \
  -d '{
    "trackingRef": "CIR2NV7EX2",
    "amount": { "amount": "50000.00", "currency": "USD" },
    "beneficiaryBank": { "accountNumber": "11001233428" },
    "memo": "trade-finance-rails cycle 2 sandbox funding"
  }'
```

Result: **201**, `status: pending`. Mock wires process in batches and take up
to **15 minutes** to appear in the balance. Confirm with:

```bash
curl -s https://api-sandbox.circle.com/v1/businessAccount/balances \
  -H "Authorization: Bearer $CIRCLE_API_KEY"
```

`available` stays `[]` until the batch runs. To top up later, repeat the mock
wire call — it is sandbox-only and cannot move real money.

```text
[x] Funded 2026-09-15 · 50,000.00 USD · landed in the balance in ~25 seconds,
    not the 15 minutes the docs warn about
```

**A MOCK WIRE HAS A $2.00 MINIMUM.** Found at A6 while proving the in-flight
path with a $1.00 leg:

```text
400: Wire payment must be greater than the minimum amount of $2.00.
```

The equivalent of the USDC rail's faucet-scale constraint, and it bounds demo
deal sizes on the inbound fiat legs the same way. Recorded here rather than
rediscovered — and note that the refusal arrived cleanly through the rail, was
written to the pending row with its reason, and booked nothing.

## Step 4 — THE CAPABILITY QUESTION — ANSWERED 2026-09-15: YES

Two of the five legs are money coming **in** — funding (the funder pays the
platform) and repayment (the debtor pays the platform). They need the sandbox
to simulate an inbound wire, and cycle 2's design deliberately refused to
guess whether it could.

```text
[x] Inbound wire simulation available?        YES
[x] Route used:                               POST /v1/mocks/payments/wire
[x] Beneficiary account:                      Circle's, from the wire
                                              instructions — NOT the registered
                                              account (see the trap above)
[ ] Webhook fired on the simulated deposit?   answer at A5, when a subscription
                                              and an endpoint exist
[x] Time from simulation to balance:          batched, up to 15 minutes
```

**Consequence for the cycle: all five legs run on the fiat rail, and cycle 2
delivers a complete all-fiat mode.** The fallback the design named — outbound
legs on Circle, inbound stuck on demo-internal — is not needed.

**And the 15-minute batch is a gift, not a cost.** The USDC rail confirms in
seconds, so nothing in this product has ever really been asynchronous; the
`--flight` treatment cycle 0 reserved has sat idle for two cycles. A deposit
that takes a quarter of an hour exercises the in-flight strip, the pending
row, the webhook and Check status the way real settlement would.

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

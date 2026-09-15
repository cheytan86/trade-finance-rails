# Manifest — circle-fiat (cycle 2) · branch `feat/circle-fiat`

## The contract (from docs/product/circle-fiat/design.md — verified at Gate 0.5, 2026-09-15)

**ENHANCE, with FIX 1 named separately.** Additive by default; **only the
allow-list below may be modified**; an unnamed modification is a stop-and-ask.
Branch cut from `feat/settlement-usdc` at `2a81fa4` (`main` holds no app).
Flag `NEXT_PUBLIC_ENABLE_CIRCLE_RAIL` — **absent means off, never an error**,
checked on the server as well as in the browser.

**One slice.** The conditional hybrid slice was removed 2026-09-15: hybrid is
two rails inside one deal, `invoices.rail` is one column, and the resolution
is the programme (cycle 6), not a schema patch here.

### New files (additive)

```text
src/lib/settlement/pending.ts          the in-flight record + completeSettlement —
                                       THE single booking path used by both the
                                       request and the webhook. Rail-neutral (FIX 1).
src/lib/settlement/pending.test.ts
src/lib/rails/circle.ts                the rail: prepare · execute · verify
src/lib/rails/circle-client.ts         HTTP against Circle; framework-free
src/lib/rails/verify-circle.ts         re-reads Circle's own record
src/lib/rails/circle.test.ts
src/lib/rails/verify-circle.test.ts
src/lib/webhooks/circle-signature.ts   fail-closed verification
src/lib/webhooks/circle-signature.test.ts
src/app/api/webhooks/circle/route.ts   the app's FIRST route handler
src/components/in-flight-strip.tsx
scripts/replay-circle-webhook.mts      signed local delivery (Chetan, 2026-09-15)
drizzle/0005_*.sql                     only after per-change re-approval
docs/circle-sandbox-runbook.md
```

### Allow-list — existing files, each with its reason

```text
 1. src/lib/rails/types.ts          RailId +circle-fiat; verify() returns the
                                    settled|pending|failed union; rails declare
                                    settlement: "immediate" | "deferred"
 2. src/lib/rails/index.ts          one registry line
 3. src/lib/rails/demo-internal.ts  conform to the new verify return
 4. src/lib/rails/usdc.ts           conform; the RPC-lag retry becomes an honest
                                    "pending" outcome
 5. src/lib/rails/verify-usdc.ts    same conformance; no refusal rule relaxed
 6. src/lib/deals/actions.ts        settleThroughRail writes the pending row
                                    BEFORE execute and delegates to
                                    completeSettlement; plus the Check-status
                                    action (A2) usdc.ts:142 has been promising
 7. src/lib/deals/preview.ts        account renames + the FIX 2 entry shapes
 8. src/lib/queries.ts              open pending rows for five surfaces
                                    [PATH CORRECTED at Gate 0.5 — the design
                                     said src/lib/deals/queries.ts, absent]
 9. src/db/schema.ts                3 new tables, enum values, the renames,
                                    the circle-payment-id uniqueness guard
10. src/lib/ledger/index.ts         ONE addition: the client-money vs
                                    platform-funds account classification for
                                    the two ledger subtotals. No change to
                                    validateEntries, bookMovement or balance
                                    derivation — sole-writer rules stand.
11. src/app/ops/deals/[id]/page.tsx in-flight strip + Check status in stage 3
12. src/app/ops/page.tsx            in-flight marker on the queue
13. src/app/ops/ledger/page.tsx     the In flight panel + two subtotals
14. src/app/pay/[invoiceId]/page.tsx wire instructions + awaited state
15. src/app/supplier/page.tsx       in-flight, never "received"
16. src/app/funder/page.tsx         in-flight, never "received"
17. src/components/pricing-form.tsx third rail option + its timing sentence
18. src/components/ui/provenance-badge.tsx  third treatment: real but not
                                    independently checkable
19. scripts/seed.mts                fiat backdrop deals incl. in-flight, failed
20. .env.example                    the flag + Circle webhook vars
```

### Untouchable

```text
src/lib/domain/states.ts   THE contract line of this cycle. In-flight is a
                           display condition, and this file staying
                           byte-identical is how that claim is VERIFIED.
src/lib/money/             the money boundary and rounding
src/lib/roles/*            no auth change; the webhook has no seat by design
src/lib/rails/wallets.ts   chain-keyed and correct
vercel.json · drizzle/0000–0004 · every component not named above
```

### Smoke path (agreed at Gate 0.5)

1. Ops pipeline on demo-internal: submit → trade validation → price → fund.
2. The public debtor payment at `/pay/[invoiceId]`.
3. Ledger balances still derive from `SUM(entries)` and are stored nowhere.

### Zero new dependencies

Circle is plain HTTP — no SDK. A genuinely required dependency is a
stop-and-ask with its cost stated.

---

## Progress

```text
Gate 0   baseline recorded 2026-09-15: tsc 0 · lint 0 · 117 tests/12 files ·
         build ✓ 9 routes.
Gate 0.5 contract verified line by line. Three discrepancies reported, none
         absorbed silently:
           - src/lib/deals/queries.ts does not exist → corrected to
             src/lib/queries.ts (the host's shared query module, which cycle 1
             also used). No new file; the boundary is unchanged in size.
           - branch parent is feat/settlement-usdc, not main (main holds no
             app) — a deliberate deviation from the kit's default.
           - working tree was dirty; today's planning + cycle 1's deploy
             record committed as 2a81fa4 before branching.
         Rails set: branch, flag (off in both env files), this manifest, the
         per-feature AGENTS block.

A0       docs/circle-sandbox-runbook.md written. The automated half is done;
         the MANUAL half is Chetan's and is not yet run: register a test wire
         bank account, fund the sandbox balance, and answer the capability
         question (can the sandbox simulate an INBOUND wire? two of five legs
         need it). Recorded as a checklist in the runbook, not guessed here.

A1       Schema + the account model (FIX 2). Migration 0005 GENERATED AND
         CORRECTED BY HAND, not yet applied — waiting on Chetan.
         drizzle-kit emitted a drop-and-recreate of account_kind whose final
         cast would have FAILED on every existing platform_treasury row: a
         generator cannot know a rename is a rename, so it models it as a
         delete plus an add. Replaced with ALTER TYPE ... RENAME VALUE, which
         preserves the data. The 0005 snapshot's enum order was then corrected
         to match, so the next `generate` reports "nothing to migrate" instead
         of resurrecting the bad block.
         Entry shapes reshaped for the split: disbursement moves only the
         platform's margin to platform_operating; payout is now TWO entries
         instead of three, because the funder's interest never left client
         money and there is nothing to give back. The simpler shape IS the
         segregation.

A1 CLOSED — migration applied, database re-seeded, gate green.
         drizzle-kit migrate → applied. Verified against Neon BEFORE re-seeding,
         because that verification is the proof the hand-fix was right:
           account_kind order matches schema.ts exactly
           client_collections = 1 account, 5 ledger entries SURVIVED the rename
             (drizzle's generated drop-and-recreate would have destroyed them)
           pending_settlements · settlement_destinations · webhook_deliveries
             all present
         Re-seeded to clear 2 legacy fee_income entries written under the old
         model. Ledger now: fee_income has ZERO entries; platform_operating
         holds the margin alone (219.07); Σ of all entries = 0.
         GATE: tsc 0 · lint 0 · 117/117 tests · build ✓ 9 routes.

A2       FIX 1 — the in-flight record and the single booking path.
         src/lib/settlement/pending.ts: the intent row is written BEFORE
         execute, never after, so "we sent money and lost the record" stops
         being reachable. completeSettlement() is the ONE place money books —
         the initiating request, the webhook and Check status all go through
         it, so there is no second path to keep in agreement. It never trusts
         what it is told: it re-reads the rail's own record every time, which
         is also why out-of-order delivery cannot matter (no delivery's CLAIM
         is ever used, only its arrival as a prompt to look).
         settleThroughRail now returns settled/in-flight; all five money gates
         guard on it and refuse to advance a deal whose money has not landed.
         checkSettlementStatus added — the control usdc.ts:142 has promised
         since cycle 1, buildable now that there is something to re-check.
         10 new tests, against the real database, including the one that
         matters: the pending row is observed to EXIST from inside execute(),
         so "written first" is distinguished from "written last".
         GATE: tsc 0 · lint 0 · 127/127 tests · build ✓.

A3       The seam's three-outcome verify, and both existing rails conformed.
         verify() now returns settled | pending | failed. A MISMATCH still
         THROWS — wrong amount, wrong recipient, wrong chain are not outcomes
         of a payment, they are signs something is wrong and must stay loud.
         Rails declare `settlement: "immediate" | "deferred"`.
         pending.ts lost its isNotYet() rule-name check, exactly as that
         function's own comment predicted it would.
         AND IT CLOSED THE DEPLOY AUDIT'S BLOCKER 1: usdc.verify no longer
         blocks up to 60s on waitForTransactionReceipt. It looks once; an
         unmined transaction is `pending`, and a reverted one is `failed`.
         The 60-second wait inside a server action was the thing a platform
         function timeout could kill AFTER execute had broadcast. Not waiting
         removes the exposure rather than surviving it.
         GATE: tsc 0 · lint 0 · 128/128 · build ✓.
         CONTRACT VERIFIED: src/lib/domain/states.ts is byte-identical to
         cycle 1 (git diff vs feat/settlement-usdc is empty) and contains 0
         rail branches — the cycle's central claim, checked not asserted.
         Untouchables clean: money, pricing, roles, wallets.ts, vercel.json.

A4       The Circle rail, client and verifier — and it moved real sandbox money.
         circle-client.ts (framework-free HTTP, key read at CALL time, refuses
         any key without a SAND_ prefix), verify-circle.ts (the fiat sibling of
         verify-usdc, held to the same refusal discipline), circle.ts (the rail).
         Direction decides the mechanism and the two are NOT symmetric: outbound
         legs are real sandbox payouts with an id we hold immediately; inbound
         legs are mock wires, which means THE PLATFORM STANDS IN FOR THE
         COUNTERPARTY'S BANK — as the demo wallets do on USDC — and the deposit
         has no id until it arrives, so it is RECOGNISED by exact amount and
         window rather than looked up.
         LIVE PROOF (2026-09-15): three payouts created through the rail against
         the real sandbox; two complete, one pending at time of writing;
         balance 50,000.00 → 49,995.50. execute → verify ran end to end.
         27 new tests. 158 total.

A5       The webhook route, signature verification, and the signed replay.
         THE APP'S FIRST ROUTE HANDLER and first unauthenticated write path —
         built inside-out from that fact. No seat, no cookie; getIdentity() is
         never called. Fails closed on flag-off, missing signature, bad
         signature, malformed body. Raw bytes are verified BEFORE any parse,
         because a JSON round trip does not reliably reproduce what was signed.
         The body is a doorbell, never evidence: it only prompts a re-read of
         Circle's own record, which is why out-of-order delivery cannot matter.
         Books through completeSettlement — no second booking path.
         LIVE PROOF over real HTTP against the dev server:
           authentic, unknown reference → 200 "no matching settlement"
           forged (signature over a different body) → 403 "signature refused"
           no signature at all → 403
           all four recorded in webhook_deliveries, the refusals included
         17 signature tests. 175 total.

A6       The screens. The in-flight strip (the cycle's one new pattern, and the
         first real tenant for --flight, reserved in cycle 0 and idle since);
         the Check-status button; the third provenance treatment — solid but
         UNLINKED, because a Circle payment id is real evidence you cannot
         check yourself, which is the axis cycle 4 will compare; the ledger's
         In-flight panel above TWO SUBTOTALS (client money held / platform
         funds); the queue marker; supplier and funder showing in-flight money
         as EXPECTED, never received; the third rail option, flag-gated.
         Also closed a gap A4 left: nothing resolved toRef, so a fiat payout
         would have refused at prepare. resolveRefs() now does it in pending.ts
         — the one module both the request and the webhook go through, which is
         what keeps the two paths from drifting.
         SEED BUG FOUND AND FIXED: the seed deleted invoices while
         pending_settlements referenced them. Cycle 2's tables now clear first.
         LIVE PROOF, the cycle's central claim:
           a fiat leg initiated → pending
           pending row: initiated, with its reference
           BALANCES UNCHANGED — in-flight money is not money
           re-check → pending again (honest, not an error)
         Every surface renders 200: / /ops /ops/ledger /supplier /funder /pay.
         The ledger shows both subtotals; fee_income renders NOWHERE, because
         it is retired and holds nothing.

FOUND LIVE AT A6 — a Circle mock wire has a $2.00 minimum. The equivalent of
         the USDC rail's faucet-scale constraint. The refusal arrived cleanly
         through the rail, was written to the pending row with Circle's own
         reason, and booked nothing — the failure path working exactly as
         designed, found by using it rather than by reading it.

CORRECTED BY READING THE DOCS — there is NO shared webhook secret. Circle signs
         with an ASYMMETRIC key: `X-Circle-Signature` + `X-Circle-Key-Id`, and
         the public key is fetched from Circle by that id. CIRCLE_WEBHOOK_SECRET
         was removed from .env.example; nothing for us to hold is a better
         posture than a secret we would have to protect. Circle Mint delivers
         over SNS, so the SubscriptionConfirmation handshake is handled too —
         with an SSRF guard, because a SubscribeURL arrives inside a request
         body and fetching it unchecked turns this endpoint into a proxy.
         The local replay key (`local-replay`) exists only because Circle
         cannot reach localhost, and is REFUSED outright when NODE_ENV is
         production — asserted by test.

FOUND LIVE, AND IT WAS NOT A FORMAT QUIBBLE — Circle 422s on a non-UUID
         idempotencyKey, with no field named. Our key is `${legType}:${invoiceId}`
         (the ledger's, deliberately). The fix is to HASH it, not regenerate it:
         a retry must produce the SAME Circle key or Circle treats it as a new
         instruction and creates a SECOND PAYOUT. A random UUID per attempt
         would have satisfied the 422 and silently broken idempotency exactly
         where it matters most. circleIdempotencyKey() + 3 tests, one of which
         asserts stability rather than shape.

ALLOW-LIST AMENDMENT 24 — src/lib/rails/seam.test.ts. Its rule that every rail
         label must say "demo" or "testnet" CAUGHT THE NEW RAIL on first run,
         which is the point of having it. Widened to include "sandbox": a Circle
         sandbox is neither a demo nor a testnet and is equally not production.
         The label was widened, not the rail renamed to something less accurate.

SCHEMA AMENDMENT (approved 2026-09-15, Chetan) — pending_settlements.entries
         jsonb, migration 0006. The design's data contract did not name it.
         Reason: completeSettlement is called hours later by the webhook, and
         payout/residual entries depend on overdue interest measured from
         `new Date()` — recomputing at completion could book numbers no human
         ever saw. Freezing the approved entries keeps ConfirmDialog's
         contract true across an asynchronous settlement: what was approved is
         what books.

ALLOW-LIST AMENDMENT 23 — vitest.config.mts. Cycle 2 adds a SECOND suite that
         talks to the real Neon database, and there is one database. Vitest
         runs files in parallel workers, so the spine's global-count
         assertions were being moved under its feet ("expected 24 to be 23").
         `fileParallelism: false` — the constraint is the shared database, not
         the assertions. Costs ~4s on the suite.

ALLOW-LIST AMENDMENT 22 — src/lib/deals/spine.integration.test.ts, same class
         as 21 and same cause: it resolved accounts by the retired kinds, so
         accountIdFor returned undefined. Updated to the new model, and case 8
         now asserts the split end to end against the real database — the
         supplier receives 40,004.00, the platform takes ONLY its 252.00
         margin, and client money falls by exactly 40,256.00, leaving the
         funder's 544.00 where it belongs.

ALLOW-LIST AMENDMENT 21 — src/lib/deals/preview.test.ts was modified and the
         design's allow-list does not name it (cycle 1's list said
         "preview.ts (+ its test)"; mine dropped the parenthesis). Flagged to
         Chetan rather than absorbed. Three pinned expectations encoded the
         OLD arithmetic and had to change; they now assert the new claim
         directly — after funding and disbursement, client money holds exactly
         the funder's interest and the platform's account holds exactly its
         margin. The segregation is now a test, not an intention.

FIX 2   RESOLVED 2026-09-15 (Chetan). Re-raised at this gate because "add
         platform_operating" was larger than one enum value: preview.ts:66-71
         parks the FUNDER'S INTEREST in fee_income at disbursement and pays it
         back at payout, so an account named "platform" was holding money owed
         to a funder.
         DECIDED: platform_operating holds ONLY the platform's margin. The
         funder's interest stays in client_collections until payout — it never
         touches a platform account, because it was never the platform's.
         fee_income retires into platform_operating. Entry count per movement
         is unchanged (three), and the segregation claim becomes literally
         true: platform accounts only ever hold platform money.
```

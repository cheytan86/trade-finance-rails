# Deploy — Settlement seam + USDC (cycle 1)

Date: 2026-09-15 · Audit: `deploy-kit/YOUR_DEPLOYMENT.md`

**This phase is retroactive, and the record says so.** The preview was put up
ad hoc during Develop (`develop.md:137-149`) and the Deploy phase was skipped.
That was caught on 2026-09-15 by `/feature-status`, which showed cycle 1
deployed with no `deploy.md`. This phase verifies and records a deployment
that already exists; the pushing was not the work, the proving was.

## The link

**https://trade-finance-rails-git-feat-settlem-d91bd6-cheytan86s-projects.vercel.app**

Preview of the unmerged `feat/settlement-usdc` branch — not production. The
branch name exceeds Vercel's alias length, so the stable alias is the hashed
form above; it follows the branch and moves on every push.

## D0 / D1 — gate and safety scan

```text
Develop gate (recorded 2026-09-15): tsc 0 errors · lint 0 problems ·
  117 tests across 12 files · build ✓ · manifest reconciled against the diff
Branch: 21 commits, pushed, 0 unpushed at audit time
```

**The history scan was run out of order, and deliberately.** D1 normally
guards the *first* push; this repo has been public since 2026-09-07 and
cycle 1 introduced four private keys, so the question was already live.

```text
git log --all --name-only | grep -E "^\.env"        → .env.example only
                                                      (committed template,
                                                       values blank)
git grep -nIE "0x[0-9a-fA-F]{64}" $(git rev-list --all)
                                                    → no match outside
                                                      docs/tests/fixtures
git grep -nIE "SAND_[A-Za-z0-9]{8,}|postgres(ql)?://[^ ]*:[^ ]*@|
               BEGIN [A-Z ]*PRIVATE KEY|sk-ant-[A-Za-z0-9]" $(git rev-list --all)
                                                    → no match

VERDICT: CLEAN across all 21 commits. No key material has ever been
committed; .env.local was never tracked. Nothing to revoke.
```

Worth recording why this needed doing at all: `develop.md`'s key-hygiene line
reads "git grep finds no key material in the **tree**". A tree scan is not a
history scan, and on a public repo only the second one settles the question.

## D2 — blockers

**1. Function duration vs the on-chain wait — found, downgraded, not fixed.**
`src/lib/rails/usdc.ts:134-137` waits for a receipt with `timeout: 60_000`
inside a server action, after a balance pre-check that can retry 4.5s
(`:90-93`). If the platform kills the function mid-wait, `execute` has already
broadcast: **the transfer is on-chain and nothing books.** Cycle 0's audit had
recorded "nothing long-running exists"; the USDC rail ended that.

Downgraded by the D4 decision below — with no wallet keys in the Preview
scope the rail cannot execute there, so this cannot bite a visitor. It still
bites local development. The real repair is cycle 2's FIX 1 (the pending
record written *before* `execute`), scheduled at A2.

**2. FINDING — a refusal message promises a control that does not exist.**
`usdc.ts:142` refuses an unconfirmed transfer with *"Nothing has been booked
— use Check status to verify it again."* Searched all of `src` and `scripts`:
the only occurrence of "Check status" in the repository is that message. No
such control was ever built. It fires in precisely the case where money has
moved and nothing booked.

Not fixed here, deliberately — Deploy clears blockers and this is not one
(the rail cannot run on the preview). It is also not worth a lone message
edit: cycle 2's A1 pending record is what a working Check-status needs and
A2's `completeSettlement()` is the re-verify it would call, so **A2 now
delivers the control on both rails** and the sentence becomes true rather
than deleted. Recorded in `docs/product/circle-fiat/design.md` under FIX 1.

**3. Verified non-blockers**, checked rather than assumed: no `vercel.json`;
0 route handlers, so no webhook surface and no cron; and all three chain env
vars **degrade safely when absent** — `NEXT_PUBLIC_USDC_ADDRESS` falls back
to the correct Base Sepolia USDC address (`usdc.ts:23-25`),
`NEXT_PUBLIC_EXPLORER_URL` to sepolia.basescan.org (`:27`), and
`NEXT_PUBLIC_RPC_URL` to viem's chain default (`:45`, `:105`). Build-time
inlining makes a missing public var the classic way a preview goes subtly
wrong; here it does not.

## D3 / D4 — settings and scopes

```text
DATABASE_URL           Preview scope only; Production scope empty
                       (carried from cycle 0's deploy record)
Deployment Protection  off — cycle 0's decision, so the demo is publicly
                       reachable
Production             dark: main holds no app and build-skip is on
Model key              N/A WITH REASON — this product calls no model API,
                       so the kit's phase-key step does not apply
CIRCLE_API_KEY         stays in .env.local; added to NO Vercel scope this
                       phase. Cycle 2 is its first legitimate use.
```

**Demo wallet keys — decided 2026-09-15, Chetan: none in any Vercel scope.**
The public demo runs `demo-internal` deals; the USDC rail stays visible and
labelled and refuses at the gate with the existing `wallet-unconfigured`
message. Rejected alternative: keys in Preview, which would let the demo
settle real testnet USDC — but faucets drip ~10–20 USDC/day against deals
sized 2–20, so a few curious visitors pressing Fund would drain the wallets
and break the demo. The on-chain proof lives where it is already strongest:
five real Base Sepolia transactions with Basescan links in `evals.md`.

**OPEN — carried to the next session.** The granted maximum function duration
on this Vercel plan, and what is currently configured, are dashboard facts
that were not read. They do not change the deployment as it stands (blocker 1
cannot fire without the wallet keys), but blocker 1 is not closable from the
repo alone and the row stays open rather than being guessed.

## D7 — verify like a stranger

Run 2026-09-15 over the public internet against the live preview. Two of the
three proofs are negatives, and all three were taken by measurement rather
than by looking at a screen.

**1 · The intended audience path works.**

```text
GET /pay            → 307 → /pay/1cd5194e-ade5-4a1c-ba11-edd02d98b398
following redirect  → 200 · 15,183 bytes
  invoice rendered (Face value / Amount due / Pay)    3 hits
  payment control present                            5 hits
  labelled testnet/demo/sandbox                      8 hits
```

The public debtor surface is reachable with no seat and no account, as an
invoice payment link is in reality, and it says what it is in eight places.

**2 · An unauthorized path is refused, with zero data in the response.**

```text
GET /ops with cookie tfr_identity={"seat":"debtor",...}
  → 200 · 12,404 bytes
  role-gate card rendered                             yes
  queue table headers ("Face value")                  0
  uuid-shaped strings in the RSC payload              0
```

Zero, not hidden — the count that matters, because cycle 0 found a layout
gate that withheld `{children}` while the page's data still shipped in the
RSC payload (`src/lib/roles/gate.tsx:5-15` carries that scar). The page-level
`seatGate()` holds: a wrong-seat request runs no queries.

**3 · Production shows nothing.**

```text
GET https://trade-finance-rails.vercel.app  → 404 · 107 bytes
```

A 107-byte 404. Nothing of this feature exists at the production domain.

### Finding from proof 2 — a missing cookie is not a wrong seat

The same request with **no cookie at all** renders `/ops` in full: 28,807
bytes, queue headers present, 21 uuid-shaped strings. The cause is explicit
in `src/lib/roles/gate.tsx:21`:

```ts
if (identity && identity.seat !== required) return <RoleGate … />;
return null;
```

A *wrong* seat is refused; a *missing* one falls through. **This is not a
security hole in this product** — seats are self-declared with no sign-in by
design (`PRD.md` §1), so an anonymous visitor can obtain any seat by setting
the cookie themselves, and the demo being publicly writable is an already
recorded accepted risk. But it is currently an accident of `identity &&`
rather than a stated posture, and the comment above the function describes
only the wrong-seat case. **Chetan's decision, carried to the next session:**
document it as intended, or treat no-cookie as no-seat and show the gate.

## Teardown

Not yet — the deployment's purpose is ongoing: this preview **is** the
product's public demo, and the release for cycle 0 is parked at R0 with the
branch alias named as the demo (`docs/product/foundation/release.md`).
Trigger for teardown: when a later cycle's preview supersedes it as the
public link, or when the branch merges at Release. The branch stays unmerged
either way. No phase key exists to revoke and no reviewer account was
provisioned.

## Status

```text
D0 gate            ✓   D1 scan            ✓ clean, 21 commits
D2 blockers        ✓   1 downgraded, 1 finding routed to cycle 2 A2
D3/D4 scopes       ◐   wallet-key decision taken; function-duration OPEN
D7 proofs          ✓   3 of 3, by measurement
D8 record          ✓   this file
D9 teardown        —   deferred with its trigger named
```

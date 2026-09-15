# Evals — Settlement seam + USDC (cycle 1)

Run 2026-09-15 against the built slice, on Base Sepolia. The five cases are
the ones written in `design.md` before any code existed. No model calls
anywhere in this feature: **these evals cost nothing to run** — except a few
cents of testnet USDC, which is worthless by construction.

Verdicts: **5 pass, 0 partial, 0 fail.**

---

## 1 · Happy path — five legs, five hashes, the deal completes

**Expected:** one USDC deal completes all five legs with five distinct
transaction hashes; every movement's entries sum to zero; the pinned overdue
example reproduces to the cent.

**Verdict: PASS.** A $3.00 invoice, priced at 85% advance / 9.50% supplier /
8.00% funder / 0.05 fixed cost, settled end to end:

```text
leg            amount        transaction
funding         2.55 USDC    0xf203de3e52c2780b…
disbursement    2.48 USDC    0xe06f0995d49e67e3…
repayment       3.00 USDC    0x95aa2f533aea7390…
payout          2.57 USDC    0x4618690502d857d1…
residual        0.45 USDC    0xd51f348f0fae2167…
five distinct hashes: true
```

Pricing reconciles: principal 2.55, supplier receives 2.48, platform margin
0.05, supplier all-in cost 2.82%. Earlier in the build the same path ran at
$2.00 — those five transactions are recorded in `develop.md`.

**Overdue, Chetan's pinned example** (8,000.00 principal, 8%→10% supplier,
7%→9% funder, 10 days late) reproduces exactly: **22.22 charged / 20.00 to
the funder / 2.22 to the platform**, computed live, not from a fixture.

## 2 · Verifier refusals, by fixture

**Expected:** wrong chain, wrong token, wrong recipient, wrong sender, wrong
amount and partially-matching multi-transfer transactions each refuse,
naming the rule; nothing books.

**Verdict: PASS** — 12 tests in `src/lib/rails/verify-usdc.test.ts`, with
fixtures encoded by viem so the real decoder runs rather than a stub. The
three defects inherited from the sibling repo are each proved fixed:

- **Chain identity:** a receipt from another chain is refused ("a valid hash
  on the wrong chain proves nothing here"), and every mainnet id — 1, 8453,
  10, 137, 42161 — is refused outright, as expectation *and* as receipt.
- **All logs summed:** a transaction whose *first* matching log equals the
  expected amount but whose total does not is refused. That is precisely the
  shape the old first-log-only code got wrong.
- **bigint throughout:** a sub-cent on-chain amount the ledger cannot
  represent is refused rather than rounded.

## 3 · Evidence reuse — one hash never settles two legs

**Expected:** offering the same transaction hash for a second leg is refused
by the database, not by the UI.

**Verdict: PASS**, exercised against real Postgres by inserting two events
with the same `tx-hash` evidence:

```text
duplicate key value violates unique constraint "settlement_events_tx_hash_once"
```

The partial unique index only constrains `tx-hash` evidence, so
demo-internal per-leg references are unaffected.

## 4 · Coexistence — the seam's own proof

**Expected:** `demo-internal` deals run the full lifecycle unchanged, cycle
0's tests stay green untouched, and the state machine contains no
rail-specific branch.

**Verdict: PASS.** The cycle-0 modules (money, pricing, ledger, states,
roles) run **42 tests green** without modification, the seeded backdrop deals
all remain on the demo-internal rail, and:

```text
grep -c "usdc|demo-internal" src/lib/domain/states.ts   →   0
```

The state machine genuinely cannot tell the rails apart — which is the whole
claim the seam makes.

## 5 · The boundary — an unverified movement cannot book

**Expected:** a movement that does not balance, or whose transfer was not
verified, books nothing.

**Verdict: PASS.** An unbalanced movement handed to the ledger is refused
before the database is touched:

```text
entries must sum to zero; got -1 minor units
```

And by construction in `settleThroughRail`: the rail executes, the rail's own
source of truth is consulted, and **only a verified transfer becomes ledger
entries** — a rail failure or an unconfirmed transaction books nothing and
leaves the deal where it was.

---

## What these evals do not prove

- That the rates are commercially calibrated. They are illustrative; the
  arithmetic is consistent, which is a different claim.
- That the system behaves under real concurrency. One deliberate race was
  tested (the idempotency key); nothing here proves behaviour under load.
- That the demo wallets' custody is safe in any legal sense — they are
  platform-held, the demonstration is deliberately not bankruptcy-remote,
  and paper §10 Q18 says so at length.
- Anything about the fiat rail, reconciliation or part payments. Cycle 1
  settles exact amounts only; a wrong-amount repayment is refused with a
  message naming cycle 3.

## The improvement this section produced

Section C found no failures — every case passed as written. Per the method's
rule that an all-pass run is a reason to harden rather than celebrate, the
hardening was done earlier and is recorded honestly instead: **live testing
during A4 found an RPC read-after-write lag** that refused a legitimate leg
(a wallet that had just received a confirmed transfer still read as empty),
and the balance pre-check now retries before refusing, with the date it bit
us in the comment. That is a real defect the test suite could not have
found — only running it against the actual chain did.

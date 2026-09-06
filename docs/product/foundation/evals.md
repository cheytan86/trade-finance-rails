# Evals — Foundation (cycle 0)

Run 2026-09-06 against the built slice. The five cases are the ones written
in `design.md` **before any code existed**, so this records the build against
what was agreed, not against what was convenient. No model calls anywhere in
this feature: **these evals cost nothing to run.**

Verdicts: **5 pass, 0 partial, 0 fail** — with one case hardened after it
passed too easily (case 3, below), because a case that cannot fail is not
evidence.

---

## 1 · Happy path — the spine completes and the ledger balances

**Expected:** submit → approve → fund → disburse on screen; the supplier
surface shows the disbursement, the funder surface the position; every
movement's entries sum to zero.

**Verdict: PASS.** Evidence is Chetan's own walkthrough, not a fixture — an
invoice he submitted through the UI and carried to disbursement:

```text
funding       funder_cash · Northgate Capital     −45,900.00
              platform_treasury                   +45,900.00   Σ 0
disbursement  platform_treasury                   −45,900.00
              supplier_payable · Amber Textiles   +45,386.62
              fee_income                             +513.38   Σ 0

locked snapshot: tenor 30 days · principal 45,900.00
                 disbursement 45,386.62 · margin 207.38
```

The arithmetic reconciles independently: 54,000.00 × 85% = 45,900.00
principal; supplier interest 45,900.00 × 9.50% × 30/360 = 363.38, plus the
150.00 fixed cost = 513.38 of fees, leaving 45,386.62 for the supplier.
Automated equivalents: integration tests 1, 4, 6, 8.

## 2 · Double booking — confirming funding twice books once

**Expected:** the second attempt is refused; exactly one movement exists.

**Verdict: PASS, at two layers.** The state machine refuses first (a funded
invoice is no longer approved — integration test 7). Because that meant the
idempotency key was never actually reached, test 11 races past the state
check and calls the ledger directly with a repeated key: Postgres rejects it,
`bookMovement` translates the violation into `ledger-already-recorded`, and
exactly one event survives. The refusal is enforced by the database, not by
the UI.

## 3 · Missing terms — funding an unpriced deal is refused

**Expected:** refused with the missing rule named; nothing books.

**Verdict: PASS — after hardening, and this is the case worth reading.**
As first run, it passed trivially: the UI cannot produce an approved deal
without terms, because approval writes them. So the guard inside `fundInvoice`
had never once been executed — passing code that never runs is not evidence.
Test 14 now approves a deal, strips its terms directly in the database, and
funds it: refused with *"Terms are not set — an invoice cannot be funded
before it is priced,"* zero events booked, status unmoved at `approved`.

## 4 · Role isolation — each seat sees only its own book

**Expected:** supplier A never sees supplier B's invoices; the funder sees
positions, not the supplier's book; the debtor link is public.

**Verdict: PASS**, measured over HTTP against the production build, counting
occurrences in the **full response body** rather than in the rendered view —
because the A4 finding was that a hidden page still ships its data:

```text
supplier=Amber, occurrences of Ostrava's 97,500.00 deal      0
supplier=Ostrava, occurrences of Amber's 54,000.00 deal      0
funder seat on /supplier, occurrences of any invoice amount  0
funder seat on /ops/ledger, occurrences of ledger content    0
no cookie at all on /pay, invoice payment page served        1
```

## 5 · The invariant holds — balances are derived, never stored

**Expected:** an unbalanced movement is refused; no balance column exists;
every rendered balance equals SUM(entries); a fractional amount is rejected.

**Verdict: PASS**, checked in the database itself:

```text
unbalanced events                                         0
columns named like '%balance%' in the schema              0
sum of every ledger entry ever booked                     0
balances recomputed from entries      funder_cash −90,525.00
                                platform_treasury  17,000.00
                                 supplier_payable  72,424.22
                                       fee_income   1,100.78
```

An unbalanced movement is refused before the database is touched
(integration test 12); `48000.005` is refused for precision rather than
rounded (test 2 and the money unit tests).

---

## The improvement this section produced

The eval run's own finding — case 3 passing without ever executing its
guard — is documented above. The wider test pass that preceded it produced
seven fixes, recorded in `develop.md`; the two that mattered were the page
and the action disagreeing about identity, and terms that would book a loss
being accepted.

**What these evals do not prove:** that the numbers are *commercially* right
(the rates are illustrative), that any of this works against a real
settlement rail (cycle 0 has none — evidence is labelled `demo-internal`),
or that the system behaves under concurrency beyond the single race tested
here.

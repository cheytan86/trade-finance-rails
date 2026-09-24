# Develop — slice 2, Epic F · the gate that stopped it

**2026-09-24. Nothing was built. This file is the evidence that the gate ran,
not a record of its absence.**

Epic F's own F4.1 reads: *"slice 2's demo gap is solved deliberately before it
is built."* Gate 0.5 measured the gap. It is real, it is differently shaped
than the design records, and **Epic F's premise does not survive it**.

Chetan's decision, 2026-09-24: **do not build slice 2.** Record Epic F as
designed-but-not-built with the finding as the reason, close cycle 3, and
re-state cycle 2's release condition, which had been set to "until slice 2 is
built" earlier the same day.

---

## Gate 0 — the baseline, on a clean tree at `bb604f1`

```text
npx tsc --noEmit     0 errors
npm run lint         0 problems
npm test             237 tests across 18 files, all passing
npm run build        succeeds — 12 routes, all dynamic
```

```text
feature        reconciliation-ops (cycle 3)
Step 1.0       ENHANCE, plus FIX A and FIX B named as their own work
Part 2         NO AGENT — conceded, not argued down
slice          2 of 2 — Epic F, remember the sender
branch         feat/reconciliation-ops (already cut; slice 1 shipped on it)
last verified  Section D, then Deploy D1–D8
allow-list     15 items, unchanged from slice 1, all still in force
```

## Gate 0.5 — the measurement

Two GETs against the live Circle sandbox. Nothing created, nothing moved.

```text
wire accounts registered: 2
  b5ac0172  CIR3YJPTAG  complete  WELLS FARGO BANK, NA ****0020
  fbf1313c  CIR2NV7EX2  complete  WELLS FARGO BANK, NA ****0010

deposits: 24
distinct source.id values: 2
  b5ac0172  11 deposits      9,814.59  WELLS FARGO BANK, NA ****0020
  fbf1313c  13 deposits    183,824.16  WELLS FARGO BANK, NA ****0010
```

**Read the two lists against each other.** The `source.id` values *are* the two
registered wire account ids. `source.name` *is* their `description`. Both of
those accounts are **the platform's own**.

### What that means

`source.id` does not identify who paid. **It identifies which of the platform's
own Virtual Account Numbers the money landed in.**

F2.3 says *"matching is on exact `source.id` and exact amount."* Keyed on that
field, Epic F would not learn *"this sender is Halvorsen."* It would learn
*"money arriving at our VAN number two belongs to Halvorsen"* — and the next
debtor told to wire to the same VAN inherits the suggestion.

```text
Day 1   Halvorsen wires 18,200 → lands in VAN #1
        source.id = fbf1313c · ops attributes to Halvorsen
        the product remembers "fbf1313c = Halvorsen"

Day 2   Meridian — a different debtor — wires 9,400
        same account number, so also VAN #1
        source.id = fbf1313c
        the product suggests "probably Halvorsen"          ← wrong
```

With two VANs and N debtors the learned rule is **wrong by construction, not by
accident**. It would not be occasionally unhelpful; it would be systematically
false, and it would stay false.

### F4's cause was diagnosed wrong twice, and this is the third reading

```text
first reading   "mock wires are indistinguishable"              wrong
2026-09-22      "only one bank account was ever registered;
                 register more and source.id differs"           TRUE — and it did
2026-09-24      two accounts, two distinct source.ids — and
                BOTH ARE OURS. Distinctness was never the
                problem. WHOSE identity the field carries is.
```

Registering more accounts makes the **wrong** behaviour demonstrable rather
than making the right behaviour possible. Each one is also permanent: Circle
exposes no delete endpoint for wire accounts, a cost this project has already
paid twice.

### Both repair routes are blocked, and the design contains both

**The lookup.** One VAN per counterparty makes *"which box did it land in"*
genuinely mean *"who sent it"*, because only that party was ever given that
number — and there is then nothing to learn. The design wrote this out itself:

> *"the counterparty's bank account is registered → it gets a VAN → they wire
> to it → `source.id` IS the party. A lookup."*

It needs Circle institutional subaccounts. Circle Customer Care, 2026-09-23:
*"The Circle Mint Account is available only to businesses… reach out to our
Sales team."* A negotiated commercial agreement, outside this repo.

**Simulating the lookup in sandbox was considered and rejected.** It would mean
registering fake per-debtor accounts as if they were the platform's own wire
accounts — which is not the mechanism production would use, and would add more
undeletable records to the Circle account to demonstrate a capability the
project does not have.

**The learned rule.** Wrong on the data that exists, as measured above.

### One production caveat, stated rather than assumed

This is the sandbox's **mock** wire endpoint, which takes the account number as
an input and resolves it to a registered account. In production, a stranger
wiring into a VAN may well produce a `source` record for *their* bank. That has
not been observed and cannot be from here. The design's own words apply:
**strong evidence, sufficient to design against, not proof fit for a compliance
statement.** What is certain is that slice 2 cannot be honestly demonstrated on
the deployment that exists.

---

## A second finding: the inbound target has silently switched

`b5ac0172` was `pending` when the design was written on 2026-09-22. It is now
`complete`, and Circle lists it **first**.

`platformInboundTarget()` (`src/lib/rails/circle.ts:69`) selects:

```ts
const usable = accounts.find((a) => a.status === "complete") ?? accounts[0];
```

So the platform is currently telling debtors to wire to **the account created
for a test**, not the original. Nothing is broken — matching is on amount and
arrival window, not on the account — but the design named this exactly:

> *"That selection is a latent defect either way — the inbound target is
> discovered, not configured."*

It has now fired, quietly, and only a measurement taken for another purpose
caught it.

**Not fixed here**, because slice 2 is not being built and fixing it would be
building. `src/lib/rails/circle.ts` is allow-list item 3, so it is repairable
inside this cycle's contract whenever a cycle opens on the fiat rail.
**The trigger: the first cycle that touches `circle.ts` again** — cycle 6 owns
rail costs and the programme, and is the likely host. Recorded in `CYCLES.md`.

---

## Why the decision is "do not build" rather than "build it anyway"

1. **The premise is false, not the implementation.** Epic F assumes a sender
   identity exists on this payload to remember. There is none. Building it
   ships a suggestion surface known to suggest wrongly — and F3 exists in the
   design *because "a rule that suggests wrongly forever is noise ops must be
   able to stop."* That would be building the noise and its stop button in the
   same slice.
2. **Slice 1 already did the cycle's job.** The design says it outright:
   *"Slice 1 is a complete feature without slice 2."* The $50,105 nobody could
   see is visible and attributable. Slice 2 only removes repeated typing.
3. **Cycle 4 is unblocked and is the headline.** `CYCLES.md`: *"the headline,
   pulled forward… so the project's core claim exists by roughly week 7 even if
   everything after slips."* It needs cycles 1–3 and nothing more.

## What this costs, named rather than glossed

**Cycle 3 ships with one of its six epics unbuilt.** That is a smaller cycle
than designed, and the design's own build-order note — *"slice 2 only makes
sense on top of a queue that already exists"* — turns out to have understated
the dependency: it needs a payload that identifies a payer, and this rail has
none.

**The `unapplied` account kind remains unused.** Slice 1 shipped it unused by
decision (see `MANIFEST.md`, "Case C is deferred"); slice 2 was not going to
use it either. It is now a declared-and-unused enum value — the exact shape
that caused two real defects in this project. **Its tenant is the overpayment
control**, already named in the manifest, and it should be built by whichever
cycle takes that on rather than left to accumulate.

## State at close

```text
branch         feat/reconciliation-ops, unmerged, 18 commits
gate           tsc 0 · lint 0 · 237 tests / 18 files · build ✓ 12 routes
slice 1        built, evaluated 5/5, deployed 2026-09-24
slice 2        NOT BUILT — this file is the reason
nothing built  no files created, no rails set, no migration written,
               no Circle accounts registered
```

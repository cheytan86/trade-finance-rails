# trade-finance-rails

Receivables financing where the settlement rail — fiat, stablecoin, or a mix
— is an explicit, priced decision for every money leg, not a technical
default. One invoice, financed three ways, with the cost, speed and risk of
each rail shown side by side.

**This is a demonstration.** Testnets, sandboxes and synthetic data only.
Nothing here moves real money, no real company or person appears anywhere,
and every mocked integration says so on the surface that renders it.

## What exists today (cycle 0 of 12)

The foundation: a deal runs end to end — a supplier submits an invoice,
platform ops approves it with terms (or refuses it, naming the reason), funds
it and disburses it — with every money movement booked as balanced
double-entry ledger entries behind an on-screen confirmation. Four seats
(supplier · ops · funder · debtor), switched rather than signed into; each
sees only its own book. Settlement evidence is labelled `demo-internal` until
the rails land.

The rules the codebase enforces structurally, not by convention:

- **Money is bigint minor units.** A float never becomes an amount; input
  with impossible precision is refused, not rounded (`src/lib/money`).
- **Balances are derived, never stored.** No balance column exists; a balance
  is `SUM(entries)`, recomputed at read (`src/lib/ledger`).
- **One writer.** `src/lib/ledger` is the only module that writes movements,
  and it refuses anything that doesn't sum to zero before touching the
  database. Idempotency is a database constraint, not a UI behaviour.
- **The browser posts decisions, never results.** Every figure is recomputed
  server-side at the moment of the consequence.
- **One identity reader.** `getIdentity()` (`src/lib/roles`) is the only
  place the seat cookie is read — the seam a real sign-in swaps into later.

## The argument

`PRODUCT_PAPER.md` — the programme paper: market, mechanics, risk, economics.
`PRD.md` — the build-facing subset, growing per cycle.
`docs/product/` — each cycle's discovery, design, develop evidence and evals.
`docs/product/CYCLES.md` — all twelve cycles, their order, and why.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill DATABASE_URL (Neon Postgres)
npx drizzle-kit migrate
node scripts/seed.mts        # synthetic demo data
npm run dev
```

Gate: `npx tsc --noEmit · npm run lint · npm test · npm run build`.

## Provenance and license

Three modules were copied in spirit from a sibling project and corrected at
the door (float money → bigint; untested → tested); the design records the
defects that were deliberately not carried along. Licensed under
[PolyForm Noncommercial 1.0.0](LICENSE.md) — read freely; commercial rights
reserved.

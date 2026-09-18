"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { priceInvoice, type ActionResult } from "@/lib/deals/actions";

const RATES = [
  { name: "advanceRate", label: "Advance rate %", def: "85.00" },
  { name: "supplierRate", label: "Supplier rate % (act/360)", def: "9.50" },
  { name: "funderRate", label: "Funder rate % (act/360)", def: "8.00" },
] as const;

export interface RateCard {
  advanceRate?: string;
  supplierRate?: string;
  funderRate?: string;
  txnCostType?: "fixed" | "percent";
  txnCostValue?: string;
  rail?: "demo-internal" | "usdc" | "circle-fiat";
}

/** The pricing step's form: the rate card and the settlement rail. Separate
 *  from approval by design — approving is the credit decision, this is the
 *  price. Re-submitting re-prices, until funding locks the snapshot. */
export function PricingForm({
  invoiceId,
  initial = {},
  submitLabel = "Price this deal",
}: {
  invoiceId: string;
  initial?: RateCard;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(priceInvoice, {});

  // CONTROLLED, and that is the whole point. React 19 resets an uncontrolled
  // form once its action returns — including when the action returns a
  // REFUSAL. So a rejected amount took the settlement rail down with it: the
  // operator fixed the typo and unknowingly re-submitted on demo-internal.
  // Found by Chetan while pricing by hand, 2026-09-18. Holding the values in
  // state means a refusal costs you the keystroke you got wrong, and nothing
  // else on the form.
  const [card, setCard] = useState({
    advanceRate: initial.advanceRate ?? "85.00",
    supplierRate: initial.supplierRate ?? "9.50",
    funderRate: initial.funderRate ?? "8.00",
    txnCostValue: initial.txnCostValue ?? "150.00",
    txnCostType: initial.txnCostType ?? "fixed",
    rail: initial.rail ?? "demo-internal",
  });
  const set = (k: keyof typeof card) => (e: { target: { value: string } }) =>
    setCard((c) => ({ ...c, [k]: e.target.value }));

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {RATES.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">{f.label}</span>
            <input
              name={f.name}
              value={card[f.name]}
              onChange={set(f.name)}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium text-muted">Transaction cost</span>
          <input
            name="txnCostValue"
            value={card.txnCostValue}
            onChange={set("txnCostValue")}
            required
            className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium text-muted">Cost type</span>
          <select
            name="txnCostType"
            value={card.txnCostType}
            onChange={set("txnCostType")}
            className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
          >
            <option value="fixed">fixed (amount)</option>
            <option value="percent">percent (of principal)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium text-muted">Settlement rail</span>
          <select
            name="rail"
            value={card.rail}
            onChange={set("rail")}
            className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
          >
            <option value="demo-internal">demo-internal (books instantly)</option>
            <option value="usdc">USDC on Base Sepolia (real testnet transfers)</option>
            {process.env.NEXT_PUBLIC_ENABLE_CIRCLE_RAIL ? (
              <option value="circle-fiat">Fiat · Circle sandbox (settles later)</option>
            ) : null}
          </select>
        </label>
      </div>
      <p className="text-[12px] text-muted">
        On the fiat rail a leg is INITIATED now and confirmed by Circle later — usually minutes, and the deal does not advance until it confirms. On the USDC rail every leg moves real testnet USDC between labelled demo wallets and books
        only once verified on-chain. Faucet-scale: keep those deals small (≈2–20 USDC).
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Pricing…" : submitLabel}
        </Button>
        {state.error ? <span className="text-[12.5px] text-refuse">{state.error}</span> : null}
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
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

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {RATES.map((f) => (
          <label key={f.name} className="flex flex-col gap-1.5 text-[13px]">
            <span className="font-medium text-muted">{f.label}</span>
            <input
              name={f.name}
              defaultValue={initial[f.name] ?? f.def}
              required
              className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
            />
          </label>
        ))}
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium text-muted">Transaction cost</span>
          <input
            name="txnCostValue"
            defaultValue={initial.txnCostValue ?? "150.00"}
            required
            className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-[13px]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px]">
          <span className="font-medium text-muted">Cost type</span>
          <select
            name="txnCostType"
            defaultValue={initial.txnCostType ?? "fixed"}
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
            defaultValue={initial.rail ?? "demo-internal"}
            className="rounded-lg border border-line bg-card px-3 py-2 text-[13.5px]"
          >
            <option value="demo-internal">demo-internal (books instantly)</option>
            <option value="usdc">USDC on Base Sepolia (real testnet transfers)</option>
          </select>
        </label>
      </div>
      <p className="text-[12px] text-muted">
        On the USDC rail every leg moves real testnet USDC between labelled demo wallets and books
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

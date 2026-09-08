import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@/lib/domain/states";

// The status vocabulary (design §5): semantic colours are reserved and mean
// one thing each. funded wears the in-flight treatment (hollow, dashed) —
// money committed, deal not finished; disbursed is booked-solid green.
const STYLES: Record<InvoiceStatus, { pill: string; dot: string }> = {
  submitted: { pill: "bg-surface text-muted", dot: "bg-muted/50" },
  approved: { pill: "bg-cobalt/10 text-cobalt", dot: "bg-cobalt" },
  funded: {
    pill: "border-[1.5px] border-dashed border-flight bg-transparent text-flight",
    dot: "border-[1.5px] border-flight bg-transparent",
  },
  disbursed: { pill: "bg-good/10 text-good", dot: "bg-good" },
  // cycle 1 — the back half. The progression intensifies toward the end:
  // disbursed (tint, solid dot) → repaid (tint, ringed dot: money is back,
  // the deal is not finished) → settled (filled: terminal, nothing pending).
  repaid: { pill: "bg-good/10 text-good", dot: "border-2 border-good bg-card" },
  settled: { pill: "bg-good text-white", dot: "bg-white" },
  refused: { pill: "bg-refuse/10 text-refuse", dot: "bg-refuse" },
};

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        s.pill,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {status}
    </span>
  );
}

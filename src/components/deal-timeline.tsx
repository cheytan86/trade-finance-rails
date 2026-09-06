import { cn } from "@/lib/cn";
import type { InvoiceStatus } from "@/lib/domain/states";

const SPINE: InvoiceStatus[] = ["submitted", "approved", "funded", "disbursed"];

export function DealTimeline({ status }: { status: InvoiceStatus }) {
  if (status === "refused") {
    return (
      <div className="flex items-center gap-2 text-[12.5px] font-semibold">
        <span className="h-2.5 w-2.5 rounded-full bg-good" />
        <span>submitted</span>
        <span className="mx-1 h-0.5 w-10 bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-refuse" />
        <span className="text-refuse">refused</span>
      </div>
    );
  }
  const reached = SPINE.indexOf(status);
  return (
    <div className="flex flex-wrap items-center text-[12.5px] font-semibold">
      {SPINE.map((s, i) => (
        <span key={s} className="flex items-center">
          {i > 0 && (
            <span className={cn("mx-2 h-0.5 w-10", i <= reached ? "bg-good" : "bg-line")} />
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full",
                i < reached && "h-2.5 w-2.5 bg-good",
                i === reached && "h-2 w-2 border-[3px] border-cobalt bg-card",
                i > reached && "h-2.5 w-2.5 bg-line",
              )}
            />
            <span className={cn(i > reached && "text-muted/60")}>{s}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

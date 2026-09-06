import { cn } from "@/lib/cn";
import { formatMinor } from "@/lib/money";

/** Every amount in the app renders through this: mono, tabular, minor units in, formatted out. */
export function Amount({
  minor,
  signed = false,
  className,
}: {
  minor: bigint;
  /** show +/− colouring for ledger entries */
  signed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono text-[13px] tabular-nums",
        signed && minor > 0n && "text-good",
        signed && minor < 0n && "text-refuse",
        className,
      )}
    >
      {signed && minor > 0n ? "+" : ""}
      {formatMinor(minor)}
    </span>
  );
}

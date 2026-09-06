"use client";

import { switchSeat } from "@/lib/roles/actions";
import { cn } from "@/lib/cn";
import type { Seat } from "@/lib/roles/parse";

// The four-seat switch. Since A4 it posts the seat DECISION to a server
// action, which validates, sets the identity cookie and redirects — the
// browser never just navigates into a seat.
const SEATS: Array<{ seat: Seat; label: string }> = [
  { seat: "supplier", label: "Supplier" },
  { seat: "ops", label: "Ops" },
  { seat: "funder", label: "Funder" },
  { seat: "debtor", label: "Debtor" },
];

export function RoleSwitch({ current }: { current: Seat | null }) {
  return (
    <nav className="ml-auto flex rounded-lg border border-line bg-surface p-[3px]">
      {SEATS.map(({ seat, label }) => (
        <form key={seat} action={switchSeat}>
          <input type="hidden" name="seat" value={seat} />
          <button
            type="submit"
            className={cn(
              "rounded-md px-3.5 py-1 text-[13px] transition-colors",
              current === seat
                ? "bg-card font-semibold text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        </form>
      ))}
    </nav>
  );
}

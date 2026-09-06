"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// A3: visual navigation between the four seats. A4 replaces the plain links
// with the cookie-backed identity switch behind getIdentity().
const SEATS = [
  { label: "Supplier", href: "/supplier", match: "/supplier" },
  { label: "Ops", href: "/ops", match: "/ops" },
  { label: "Funder", href: "/funder", match: "/funder" },
  { label: "Debtor", href: "/pay", match: "/pay" },
] as const;

export function RoleSwitch() {
  const pathname = usePathname();
  return (
    <nav className="ml-auto flex rounded-lg border border-line bg-surface p-[3px]">
      {SEATS.map((s) => {
        const active = pathname === s.match || pathname.startsWith(`${s.match}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={cn(
              "rounded-md px-3.5 py-1 text-[13px] transition-colors",
              active
                ? "bg-card font-semibold text-ink shadow-card"
                : "text-muted hover:text-ink",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

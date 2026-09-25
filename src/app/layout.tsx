import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { RoleSwitch } from "@/components/role-switch";
import { getIdentity } from "@/lib/roles/identity";
import "./globals.css";

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "trade-finance-rails",
  description:
    "Receivables financing where the settlement rail is a priced decision. Demonstration only — testnets and synthetic data.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const identity = await getIdentity();
  return (
    <html lang="en" className={`${instrument.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <header className="flex items-center gap-5 border-b border-line bg-card px-6 py-3">
          <span className="text-[15px] font-semibold tracking-tight">
            trade<span className="text-cobalt">·</span>finance
            <span className="text-cobalt">·</span>rails
          </span>
          <RoleSwitch current={identity?.seat ?? null} />
        </header>
        <div className="border-b border-line bg-surface px-4 py-1.5 text-center text-xs text-muted">
          Demonstration — testnets and synthetic data only. Nothing here moves real money.
        </div>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

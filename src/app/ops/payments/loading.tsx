// What a person sees the instant they click, instead of two seconds of the
// previous page.
//
// Found at Deploy D7, 2026-09-24, by Chetan using the preview: "the
// application feels slow, when i click it takes about 2 seconds with no reload
// shown on the screen." There is no loading state anywhere in this
// application — 0 loading.tsx files, 0 Suspense boundaries before this cycle —
// and a server component renders NOTHING until it has everything. This page
// waits on Circle, so the wait is real.
//
// It matters more here than on a list of deals: a money screen where a click
// appears to do nothing is how people double-click, and double-clicking an
// attribution is precisely the race the server-side refusal exists for.
//
// Host vocabulary only — Card, the same headings, the same sizes. Nothing
// animates: a spinner would be a new idiom, and the page arrives in under a
// second anyway.

import { Card } from "@/components/ui/card";

export default function LoadingPayments() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {["payments received", "unattributed", "unattributed value"].map((label) => (
          <Card key={label}>
            <div className="font-mono text-[19px] tabular-nums text-muted">—</div>
            <div className="text-[11.5px] uppercase tracking-wide text-muted">{label}</div>
            <div className="text-[12px] text-muted">asking the rails…</div>
          </Card>
        ))}
      </div>
      <Card title="Money received" sub="Reading what each rail holds. This asks Circle directly, so it takes a moment.">
        <p className="text-[13px] text-muted">
          Nothing is cached and nothing is stored — the rail is the record of what it holds, so
          the question is asked afresh every time this page opens.
        </p>
      </Card>
    </div>
  );
}

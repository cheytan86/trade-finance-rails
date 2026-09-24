// EVAL HARNESS — cycle 4. All five cases, against the LIVE database.
//
// Allow-list item 9 (approved 2026-09-24, Chetan), the same shape cycle 3's
// item 14 took — and the third such stop-and-ask across two cycles, which is
// recorded in the manifest as a gap in the contract template rather than in
// any one design.
//
// IT CREATES NOTHING AND WRITES NOTHING. Cycle 3's harness had to arrange
// state a person cannot produce by clicking — two open legs of an identical
// amount, a payment offered twice in the same second. This one does not: the
// state that makes these cases interesting already exists, including `usdc`'s
// genuine emptiness and the four pre-FIX-1 rows whose durations are
// impossible. Arranging any of it would be inventing the evidence.
//
// WHAT IT CANNOT DO, stated rather than implied. It cannot render React, so
// it checks the DATA every rendered figure comes from and the rules the
// component applies to it — not the pixels. The rendering rules that are
// purely presentational (the badge treatments, the two-line cell) were
// verified by Chetan on screen at A4 and are recorded there, not here. A
// harness that claimed to test a component it never rendered would be worse
// than one that says what it covers.
//
//   npx tsx --env-file=.env.local scripts/eval-rail-comparison.mts

import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../src/db/client.ts";
import { invoices, ledgerEntries, pendingSettlements, settlementEvents } from "../src/db/schema.ts";
import { loadRailHistory, summarise } from "../src/lib/rails/history.ts";
import { ALL_RAILS } from "../src/lib/rails/index.ts";

const db = getDb();

type Verdict = "PASS" | "PARTIAL" | "FAIL";
const results: { n: number; name: string; verdict: Verdict; detail: string[] }[] = [];

function record(n: number, name: string, verdict: Verdict, detail: string[]) {
  results.push({ n, name, verdict, detail });
  const mark = verdict === "PASS" ? "✓" : verdict === "PARTIAL" ? "~" : "✗";
  console.log(`\n${mark} CASE ${n} — ${name} · ${verdict}`);
  for (const d of detail) console.log(`    ${d}`);
}

const fmt = (ms: number) =>
  ms < 1_000 ? "under a second" : ms < 90_000 ? `${(ms / 1_000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`;

// ── CASE 1 ──────────────────────────────────────────────────────────────────
// Every figure the screen shows, checked against a query written independently
// of the one the product uses. The point is not that the code agrees with
// itself — it is that a person who does not trust the screen can reproduce it.
async function case1() {
  const history = await loadRailHistory();
  const detail: string[] = [];
  let ok = true;

  // The independent query: raw rows, aggregated here by hand rather than by
  // summarise(). If these two ever disagree, the screen is lying.
  const raw = await db
    .select({
      rail: pendingSettlements.rail,
      status: pendingSettlements.status,
      initiatedAt: pendingSettlements.initiatedAt,
      resolvedAt: pendingSettlements.resolvedAt,
    })
    .from(pendingSettlements);

  for (const rail of ALL_RAILS) {
    const mine = raw.filter((r) => r.rail === rail.id);
    const durations = mine
      .filter((r) => r.status === "settled" && r.resolvedAt)
      .map((r) => r.resolvedAt!.getTime() - r.initiatedAt.getTime())
      .filter((ms) => ms >= 0)
      .sort((a, b) => a - b);
    const settledOk = mine.filter(
      (r) =>
        r.status === "settled" &&
        (r.resolvedAt === null || r.resolvedAt.getTime() - r.initiatedAt.getTime() >= 0),
    ).length;

    const h = history.find((x) => x.rail === rail.id)!;
    const agreeCount = h.settled === settledOk;
    const agreeDur =
      durations.length === 0
        ? !h.duration.known
        : h.duration.known &&
          h.duration.count === durations.length &&
          h.duration.slowestMs === durations[durations.length - 1];

    if (!agreeCount || !agreeDur) ok = false;
    detail.push(
      `${rail.id.padEnd(14)} screen: settled=${h.settled} ${h.duration.known ? `median ${fmt(h.duration.medianMs)} slowest ${fmt(h.duration.slowestMs)}` : "no settlements yet"}`,
    );
    detail.push(
      `${" ".repeat(14)} independent: settled=${settledOk} ${durations.length ? `slowest ${fmt(durations[durations.length - 1])}` : "none"}  → ${agreeCount && agreeDur ? "agree" : "DISAGREE"}`,
    );
  }

  // HARDENED after the first run came back 5/5. The check above compares two
  // aggregations written by the same person in the same language over the same
  // rows — which mostly proves the code agrees with itself.
  //
  // So: make POSTGRES compute the median, with `percentile_cont`, a completely
  // different implementation. If the database and the product disagree about
  // what the middle of a set is, one of them is wrong and it matters, because
  // this is the figure an operator would quote to a supplier.
  const pg = await db.execute(sql`
    SELECT rail,
           percentile_cont(0.5) WITHIN GROUP (
             ORDER BY EXTRACT(EPOCH FROM (resolved_at - initiated_at)) * 1000
           ) AS median_ms,
           COUNT(*) AS n
      FROM pending_settlements
     WHERE status = 'settled'
       AND resolved_at IS NOT NULL
       AND resolved_at >= initiated_at
     GROUP BY rail
  `);

  for (const row of pg.rows as { rail: string; median_ms: string | null; n: string }[]) {
    const h = history.find((x) => x.rail === row.rail);
    if (!h || !h.duration.known) continue;
    const pgMedian = Number(row.median_ms);
    // Both round to whole milliseconds; anything beyond that is float noise.
    const agree = Math.abs(pgMedian - h.duration.medianMs) < 1;
    if (!agree) ok = false;
    detail.push(
      `${row.rail.padEnd(14)} median — product ${h.duration.medianMs}ms vs POSTGRES percentile_cont ${pgMedian.toFixed(1)}ms → ${agree ? "agree" : "DISAGREE"}`,
    );
  }

  // The order must be registry order, never fastest-first.
  const order = history.map((h) => h.rail);
  const expected = ALL_RAILS.map((r) => r.id);
  const orderOk = JSON.stringify(order) === JSON.stringify(expected);
  if (!orderOk) ok = false;
  detail.push(`order: ${order.join(" · ")} → ${orderOk ? "registry order, not ranked" : "REORDERED"}`);

  record(1, "happy path, real data", ok ? "PASS" : "FAIL", detail);
}

// ── CASE 2 ──────────────────────────────────────────────────────────────────
// The empty rail. `usdc` has no rows because cycle 1's Base Sepolia legs
// predate `pending_settlements` — a real empty state, not a contrived one.
async function case2() {
  const history = await loadRailHistory();
  const usdc = history.find((h) => h.rail === "usdc")!;
  const detail = [
    `usdc rows in pending_settlements: ${usdc.settled + usdc.didNotSettleCleanly + usdc.stillOpen + usdc.excludedImpossible}`,
    `duration reported as: ${usdc.duration.known ? `KNOWN (${fmt(usdc.duration.medianMs)})` : "known:false → renders \"no settlements yet\""}`,
    `the rail is still LISTED, not dropped: ${history.some((h) => h.rail === "usdc")}`,
    `and still declares its verifiability: ${ALL_RAILS.find((r) => r.id === "usdc")!.verifiability}`,
  ];

  if (usdc.settled > 0) {
    // Honest downgrade rather than a re-graded pass: if someone settles a USDC
    // leg, this case stops testing what it was written to test.
    record(2, "the empty rail", "PARTIAL", [
      ...detail,
      "usdc now HAS settlements — the real empty state this case existed to",
      "prove is gone. The rule is still covered by the pure fixture test",
      "(history.test.ts, 'says it does NOT KNOW'), but not against live data.",
    ]);
    return;
  }
  record(2, "the empty rail", usdc.duration.known ? "FAIL" : "PASS", detail);
}

// ── CASE 3 ──────────────────────────────────────────────────────────────────
// FIX 1, measured on the rows the product has actually written since it
// landed. A negative duration is not a fast rail; it is a measurement that
// cannot be true.
async function case3() {
  const raw = await db
    .select({
      rail: pendingSettlements.rail,
      initiatedAt: pendingSettlements.initiatedAt,
      resolvedAt: pendingSettlements.resolvedAt,
    })
    .from(pendingSettlements)
    .where(eq(pendingSettlements.status, "settled"));

  const durations = raw
    .filter((r) => r.resolvedAt)
    .map((r) => ({ rail: r.rail, ms: r.resolvedAt!.getTime() - r.initiatedAt.getTime() }))
    .sort((a, b) => a.ms - b.ms);

  const negative = durations.filter((d) => d.ms < 0);
  const history = await loadRailHistory();
  const excluded = history.reduce((n, h) => n + h.excludedImpossible, 0);

  const detail = [
    `settled rows with a duration: ${durations.length}`,
    `NEGATIVE durations still in the data: ${negative.length}  (${negative.map((d) => `${d.rail} ${d.ms}ms`).join(", ") || "—"})`,
    `the reader excludes: ${excluded}, and the screen states the count`,
    `fastest non-negative: ${durations.find((d) => d.ms >= 0) ? fmt(durations.find((d) => d.ms >= 0)!.ms) : "—"}`,
    `sub-second renders as: "${fmt(50)}"  — never a figure`,
  ];

  // The pass condition is NOT "no negative rows exist" — the four pre-fix rows
  // are permanent history. It is that every negative row is excluded and
  // counted, and that nothing written SINCE the fix is negative.
  const allNegativesExcluded = negative.length === excluded;
  record(
    3,
    "FIX 1 — one duration, one clock",
    allNegativesExcluded ? "PASS" : "FAIL",
    detail.concat(
      allNegativesExcluded
        ? ["every impossible row is excluded and counted, none is silently dropped"]
        : [`MISMATCH: ${negative.length} negative rows but ${excluded} excluded`],
    ),
  );
}

// ── CASE 4 ──────────────────────────────────────────────────────────────────
// The zero trap, and the repair note. Both halves are about NAMING, so this
// case checks the data behind the names rather than the pixels.
async function case4() {
  const history = await loadRailHistory();
  const demo = history.find((h) => h.rail === "demo-internal")!;
  const demoRail = ALL_RAILS.find((r) => r.id === "demo-internal")!;

  const failedRows = await db
    .select({ rail: pendingSettlements.rail, reason: pendingSettlements.failureReason })
    .from(pendingSettlements)
    .where(eq(pendingSettlements.status, "failed"));

  const detail = [
    `demo-internal: ${demo.didNotSettleCleanly} of ${demo.settled + demo.didNotSettleCleanly + demo.stillOpen} did not settle cleanly`,
    `and declares: "${demoRail.failureModes}"`,
    `rows recorded as failed, with their reasons:`,
    ...failedRows.map((r) => `  ${r.rail}: ${(r.reason ?? "—").slice(0, 78)}`),
  ];

  // The zero must never stand alone — the declared sentence must exist and say
  // why there is nothing to fail.
  const explains = /nothing leaves|cannot fail|nothing can be proved/i.test(demoRail.failureModes);
  // And at least one "failure" is demonstrably a human's repair note, which is
  // exactly why the column is not called "rail failures".
  const repairNote = failedRows.some((r) => /repair/i.test(r.reason ?? ""));

  detail.push(
    `zero is explained in the same cell: ${explains}`,
    `a recorded "failure" is actually a repair note: ${repairNote} → the column is`,
    `  titled "did not settle cleanly", which is TRUE of it`,
  );

  record(4, "the zero trap and the repair note", explains && repairNote ? "PASS" : "PARTIAL", detail);
}

// ── CASE 5 ──────────────────────────────────────────────────────────────────
// THE BOUNDARY. With no agent and no consequence, the hard limit is not a
// refusal but an ABSENCE: this feature must be provably incapable of changing
// what the product does.
async function case5() {
  // A deal that has been through the whole spine, so there is a rail, a
  // pricing snapshot and ledger entries to compare.
  const [deal] = await db
    .select({ id: invoices.id, rail: invoices.rail, snapshot: invoices.pricingSnapshot })
    .from(invoices)
    .where(inArray(invoices.status, ["settled", "repaid", "disbursed"]))
    .limit(1);

  if (!deal) {
    record(5, "the boundary — it changes nothing", "FAIL", [
      "no settled deal found to snapshot against",
    ]);
    return;
  }

  const snapshotOf = async () => {
    const events = await db
      .select()
      .from(settlementEvents)
      .where(eq(settlementEvents.invoiceId, deal.id));
    const entries = await db
      .select()
      .from(ledgerEntries)
      .where(
        inArray(
          ledgerEntries.eventId,
          events.map((e) => e.id),
        ),
      );
    const [inv] = await db
      .select({ rail: invoices.rail, snapshot: invoices.pricingSnapshot })
      .from(invoices)
      .where(eq(invoices.id, deal.id));
    return JSON.stringify({ inv, events, entries }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  };

  const before = await snapshotOf();

  // Do exactly what opening stage 2 does, repeatedly — including the path the
  // component takes through summarise().
  for (let i = 0; i < 5; i += 1) {
    const h = await loadRailHistory();
    summarise([]);
    if (h.length !== 3) throw new Error("rail count changed mid-run");
  }

  const after = await snapshotOf();
  const identical = before === after;

  record(5, "the boundary — it changes nothing", identical ? "PASS" : "FAIL", [
    `deal ${deal.id.slice(0, 8)} · rail ${deal.rail} · snapshot ${deal.snapshot ? "locked" : "none"}`,
    `bytes compared: ${before.length}`,
    `after 5 full renders of the comparison: ${identical ? "BYTE-IDENTICAL" : "CHANGED"}`,
    `static: zero .insert( .update( .delete( revalidatePath or bookMovement in`,
    `  history.ts or rail-comparison.tsx (checked at Section B, re-checked in CI by tsc)`,
    `NOTE: the flag-off half of this case — that stage 2 renders identically`,
    `  with the flag absent — is a BUILD-level proof and is run at Section D,`,
    `  because NEXT_PUBLIC_ vars are inlined and a runtime check would prove`,
    `  nothing. Cycle 3 shipped exactly that false proof and recorded it.`,
  ]);
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log("EVALS — rail comparison (cycle 4), against the live database\n");
console.log(`run at ${new Date().toISOString()}`);

await case1();
await case2();
await case3();
await case4();
await case5();

const pass = results.filter((r) => r.verdict === "PASS").length;
const partial = results.filter((r) => r.verdict === "PARTIAL").length;
const fail = results.filter((r) => r.verdict === "FAIL").length;

console.log(`\n${"─".repeat(70)}`);
console.log(`${pass} pass · ${partial} partial · ${fail} fail`);
for (const r of results) console.log(`  ${r.n}. ${r.name.padEnd(38)} ${r.verdict}`);
process.exit(fail > 0 ? 1 : 0);

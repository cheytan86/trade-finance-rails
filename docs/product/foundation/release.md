# Release — Foundation (cycle 0)

## R0 — the go/no-go (2026-09-07)

**Decision, Chetan's, recorded verbatim: "No-go, until X" — with X left open;
the release is parked while building continues.** A parked feature is a
completed R0, not a failure.

Evidence the decision rested on (quoted in session from deploy.md,
develop.md, evals.md): the three D7 proofs run over the public internet
(demo reachable with live data · wrong-seat path refused with zero data in
the response · production shows nothing), the final develop gate (tsc 0 ·
lint 0 · 59 tests · build ✓), and evals 5/5 with one case hardened.

**Standing state while parked:**
- `feat/foundation` stays unmerged at `cffbefb`+; the **branch-alias preview
  remains the product's public demo**:
  https://trade-finance-rails-git-feat-foundation-cheytan86s-projects.vercel.app
- Production (`trade-finance-rails.vercel.app`) stays dark: main build-skip
  on, Production env scope empty.
- Cycle 1 builds on `feat/foundation`'s history (branch strategy for cycle 1
  is its own Gate 0.5 decision — likely a new branch cut from
  `feat/foundation`, since `main` lacks the app).

**Reopening:** invoke `/release` again; R0 re-runs against then-current
evidence. Natural reopening moments: after cycle 1 gives the demo a real
settlement rail, or whenever the branch-alias URL needs to become the
production one.

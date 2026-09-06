---
description: Start the Release phase for a deployed feature (phase 5 of 5)
argument-hint: <feature-slug>
---

I am starting the **Release** phase for the feature **$ARGUMENTS** — the deliberate path from its unmerged branch to real users: merge flag-off → enable in production → stability window → retire the flag.

First check the evidence: `docs/product/$ARGUMENTS/deploy.md` with recorded proof (for agent features, pilot verdicts) — or, for LIGHT-track features (a `brief.md` feature with no deploy phase), the develop gate + local production flag-off proof recorded in `develop.md`. Missing evidence: stop and tell me which phase to finish.

Then read `release-kit/AGENTS.md` and follow it exactly, working through `release-kit/05_RELEASE.md` one prompt at a time, starting at R0.

Key rules (the kit has the rest): the go/no-go is mine, made on quoted evidence — "no-go, until X" is a complete R0. Nothing merges red or stale (main merged into the branch first, full gate on the result). Merge and enable are **two decisions with two approvals** — moving main deploys production (STACK_RULES.md), and the flag being off is what makes that safe. The kill switch is stated before the flag flips. The stability window has numbers. Retirement updates the meta layer (`YOUR_PRODUCT.md`, the AGENTS block, the worked example if first cycle). Everything lands in `docs/product/$ARGUMENTS/release.md`, then `/feature-status`.

Start with R0.

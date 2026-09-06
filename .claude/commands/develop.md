---
description: Start the Develop phase for a designed feature (phase 3 of 5)
argument-hint: <feature-slug>
---

I am starting the **Develop** phase for the feature **$ARGUMENTS**.

First check that `docs/product/$ARGUMENTS/design.md` exists — or, for LIGHT-track features, `brief.md`, whose contract and three eval cases serve as the design. If neither exists, stop and tell me to run `/discover` (or `/quick`) first — never build without one. If the design's build-order decision chose two slices, check which develop file already exists (`develop-1-substrate.md`?) and ask me which slice this run builds before anything else.

Then read `develop-kit/AGENTS.md` and follow it exactly, together with `develop-kit/03_DEVELOP.md`, `develop-kit/INTEGRATION_ADDENDUM.md` and the playbook. AGENTS.md carries the session rules; follow them with this feature's slug filled in.

Key rules (the kit has the rest): Gate 0 reads the design file and records the gate-command baseline; Gate 0.5 **verifies** the design's integration contract line by line and, only with my written approval, sets the rails (branch `feat/$ARGUMENTS`, flag off, manifest, per-feature AGENTS block); then one playbook prompt at a time on the design's track, BUILT/FILES/CHECK/VERIFY/REGRESSION each. Additive only, allow-list only, stop-and-ask. Evidence to `docs/product/$ARGUMENTS/`. Branch stays unmerged; stop before Deploy. LIGHT-track features: smoke path at section gates, evidence as a short note beside the gate output, and Deploy is replaced by a local production build + flag-off proof recorded in develop.md — but re-apply the weight test if the build grows a model call, schema change, or money path, and stop if it does.

**If this feature's Develop is already mid-flight** (its manifest exists at `src/features/$ARGUMENTS/MANIFEST.md`): do not re-run the gates. Follow the AGENTS re-entry rule instead — read the manifest and the design's contract, state the allow-list and the last verified prompt back to me, and wait.

Start with Gate 0 (or the re-entry rule above).

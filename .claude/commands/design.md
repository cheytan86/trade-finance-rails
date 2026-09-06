---
description: Start the Design phase for a discovered feature (phase 2 of 5)
argument-hint: <feature-slug>
---

I am starting the **Design** phase for the feature **$ARGUMENTS**.

First check that `docs/product/$ARGUMENTS/discovery.md` exists. (If `brief.md` exists instead, this is a LIGHT-track feature — Design is already inside the brief; tell me to run `/develop` directly.) If it does not, stop and tell me to run `/discover` first — do not improvise a discovery.

Then read `design-kit/AGENTS.md` and follow it exactly, together with `design-kit/02_DESIGN.md`, `design-kit/DESIGN_SYSTEM_NOTES.md`, — AGENTS.md carries the session rules; follow them with this feature's slug filled in.

Key rules (the kit has the rest): product substrate first; the agent question is asked for every feature with **default no** — the agent must earn its place; classify NEW/ENHANCE/FIX with file evidence before designing; end with the integration contract, the eval plan and the build order. Output goes to `docs/product/$ARGUMENTS/design.md`. Design is paper — no code. Stop when the file is written.

Start with Step 0: read the discovery file and state the feature back to me in two sentences.

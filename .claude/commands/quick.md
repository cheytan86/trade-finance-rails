---
description: LIGHT track — brief a small feature in one session (discovery + design merged)
argument-hint: <small feature idea>
---

I want to build a small feature on the **LIGHT track**: **$ARGUMENTS**

First read `discovery-kit/PROCESS_GUIDE.md` (the weight test section), `discovery-kit/FEATURE_BRIEF_TEMPLATE.md`, `discovery-kit/AGENTS.md` (the grilling rules apply here too), and `discovery-kit/YOUR_PRODUCT.md`.

**Run the weight test honestly before anything else**: model calls? money movement? schema change? auth/permissions beyond reusing a grant? more than a handful of existing files? **Any yes → stop and tell me this is a FULL-track feature: run `/discover` instead.** Do not soften the test to keep the session short.

If it passes: one session, one file. Grill the idea (real role, real trigger, demoable, three checkable eval cases), check the current state with file evidence (NEW/ENHANCE/FIX), ask the agent question (a yes bumps to FULL), and write the brief to `docs/product/<feature-slug>/brief.md` per the template — including the contract naming every existing file the build may touch.

Then stop: next step is `/develop <feature-slug>`, which builds from the brief. No code in this session, and run `/feature-status` before ending.

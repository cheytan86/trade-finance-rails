---
description: Start the Deploy phase for a developed feature (phase 4 of 5)
argument-hint: <feature-slug>
---

I am starting the **Deploy** phase for the feature **$ARGUMENTS**.

First check that `docs/product/$ARGUMENTS/develop.md` (or `develop-*.md`) exists with a recorded eval verdict. If it does not, stop and tell me to finish `/develop` first — nothing unproven ships.

Then read `deploy-kit/AGENTS.md` and follow it exactly, together with `deploy-kit/START_HERE.md`, `STACK_RULES.md`, and this feature's design contract. Work through `deploy-kit/SHIP_PLAYBOOK.md` one prompt at a time, starting at **D-1** (the deployment audit — fill `deploy-kit/YOUR_DEPLOYMENT.md` for this feature from the repo and the host dashboard, every fact cited).

Key rules (the kit has the rest): the branch ships as a preview/staging deployment and **stays unmerged**; secrets and the flag go to the preview scope only, on a new spend-limited key; the safety scan covers the full branch history before any first push; the push waits for my written yes; verification proves the negatives (unauthorized refused, production untouched); teardown runs after the purpose is served. Evidence to `docs/product/$ARGUMENTS/deploy.md`, then `/feature-status`.

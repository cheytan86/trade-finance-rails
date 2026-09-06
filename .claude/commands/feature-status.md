---
description: Show where every feature stands, and rebuild the pipeline dashboard
---

Rebuild my feature-pipeline status view from the actual files — never from memory.

**Gather:**
1. `ls docs/product/` — each subfolder is a feature; note which of `discovery.md` (or `brief.md` — LIGHT track), `design.md`, `develop*.md`, `deploy.md` (LIGHT features skip it — render that station as 'skipped · light'), `release.md` exist, and pull each file's headline verdicts (Design: NEW/ENHANCE/FIX, agent-or-no-agent, build order; Develop: baseline numbers and eval verdict line).
2. `git branch --list 'feat/*'` — which feature branches exist.
3. Any features predating `docs/product/` (the worked example era, if this project has one — see `WORKED_EXAMPLE.md` for where their records live).

**Report** a compact table in the terminal: feature · discovered · designed (verdicts) · developed (slices, eval score) · deployed · released · branch.

**Then update the dashboard artifact:**
- Call the Artifact tool with `action: "list"` and find the artifact titled **"{{PRODUCT_NAME}} Pipeline"** (favicon 🚦). If found, regenerate the dashboard HTML and publish with its `url` so the link stays stable. If not found, create it fresh (title "{{PRODUCT_NAME}} Pipeline", favicon 🚦, keep both stable for future updates).
- Before writing the page, load the `artifact-design` skill. The page: one row/card per feature with a five-station phase indicator (Discover → Design → Develop → Deploy → Release), the verdicts, eval scores, branch names and dates, an empty-state hint ("run /discover to start a feature") when no feature rows exist yet, and a footer noting when and from what it was generated. Self-contained HTML, theme-aware, private by default.
- Give me the dashboard URL at the end.

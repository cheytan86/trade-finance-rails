# Product documentation — the feature pipeline's outputs

Every feature built with the four-phase process (Discovery → Design → Develop → Deploy) writes its phase outputs here, one folder per feature:

```text
docs/product/<feature-slug>/
  discovery.md              ← the 10 Discovery rows (FULL track)
  brief.md                  ← LIGHT track: discovery + design merged in one file
  design.md                 ← the blueprint + the integration contract
  develop.md                ← baseline, eval export, the 8 evidence rows
                              (two-slice features: develop-1-substrate.md,
                               develop-2-agent.md — one file per Develop run)
  deploy.md                 ← the deploy rows + live link (once the deploy
                              kit is generalized)
  release.md               ← the release record: go decision, enable, window, retirement
```

Slugs are kebab-case and stay identical across all four phases and the
branch name (`feat/<feature-slug>`) — the slug is how the phases, the
branch and the tracker find each other.

These are ordinary tracked files: **commit them when you choose** (the
process never commits on its own). The process itself lives in the four
gitignored kit folders — start with `discovery-kit/PROCESS_GUIDE.md`, or just run `/discover <your idea>`.

The worked example predates this layout; its equivalent records live at
`AGENT_FEATURE_MANIFEST.md` (repo root) and `src/features/agent-console/PRD_ROWS.md`,
and it appears on the pipeline dashboard as the completed worked example.

`/feature-status` scans this directory (plus `git branch --list 'feat/*'`)
and rebuilds the private pipeline dashboard.

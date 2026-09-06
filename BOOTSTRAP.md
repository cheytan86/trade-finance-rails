# BOOTSTRAP — Phase 0: Adopt the process into this repo

Run once per project, after copying the kits in (see `README.md`). This is an
**audit session**, and it is held to the same evidence rule as every phase it
installs: every claim about this repo comes from reading files, cited by
path; anything the dashboard alone knows is asked of the user, never assumed.
A bootstrap that guesses produces a hollow process that *looks* rigorous —
worse than none.

## The prompt to paste

```text
I am adopting the four-phase feature process (Discovery → Design → Develop →
Deploy) into this repo. Read process README.md and the four kit folders'
AGENTS.md files so you know what the process expects, then produce the three
project-fact files by AUDITING THIS REPO — every claim cited to a file, no
claim from memory, and anything you cannot verify marked UNVERIFIED for me to
resolve. Ask me one question at a time for what only I know (host dashboard
settings, what data is real vs test, who the users are).

Produce, in order, pausing for my review after each:

1. STACK_RULES.md (from STACK_RULES.template.md): the gate commands — RUN
   them and record the real baseline numbers, including "no test suite" said
   plainly if true; framework + version and its quirks (check the version
   against your knowledge cutoff — if newer, name the local docs to read
   before writing framework code); the data layer and the fixtures/live-client
   boundary rule with a concrete audit command; the permission pattern with
   file:line; secrets naming and env files; the host platform, what a push
   causes, and the env scoping model (ask me to read the dashboard); the
   untouchables, each with why; the high-stakes surfaces; smoke-path
   candidates.

2. discovery-kit/YOUR_PRODUCT.md (from its template): what the product is
   and the flow that works end to end today; real surface counts WITH the
   commands that produced them; the areas table; what is already deep; the
   standing constraints; the verify commands. NO gap list, NO roadmap, NO
   feature suggestions — that is a standing rule, not an omission.

3. design-kit/DESIGN_SYSTEM_NOTES.md (from its template): the actual
   primitives with their real class strings/props; the palette and what the
   accent is actually used for; the type scale including the smallest size in
   the app and anything the app NEVER uses; the recurring screen patterns,
   each citing its file.

Then:
4. Confirm docs/product/README.md and .claude/commands/ are in place; rename
   WORKED_EXAMPLE.template.md to WORKED_EXAMPLE.md.
5. State which boundary mode this project is in: EXISTING (allow-list
   discipline from feature one) or NEW (foundation mode — the boundary
   switches on once a first slice works; record that trigger in STACK_RULES.md).
6. Tell me the process is ready and that the next step is /discover — and do
   not suggest what to discover. Choosing features is mine.
```

## What good bootstrap output looks like

- Numbers with commands beside them (`find src/app -name page.tsx | wc -l → 32`),
  not adjectives ("a medium-sized app").
- "There is no test suite" written where true, so no session ever claims
  tests passed.
- UNVERIFIED markers where the repo alone couldn't answer — resolved with the
  user before the file is called done.
- Zero feature ideas. A bootstrap that ends with "you could build X" has
  broken the process's oldest rule on day zero.

## Re-bootstrap

The fact files age as the product grows. Re-run this audit (or just its
verify commands) whenever Discovery's Step 0 spot-checks start finding
drift — the phases correct small drift themselves; a big pivot deserves a
fresh audit.

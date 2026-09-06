# The Worked Example

<!-- Rename to WORKED_EXAMPLE.md beside the kit folders. Until this project
     completes its own first cycle, this file carries the ORIGIN PROJECT's
     reference build so the kits' references resolve to something real.
     REPLACE the story below with your own first completed feature as soon as
     one exists — a worked example from someone else's product teaches the
     pattern, but only your own can be cited as evidence. -->

## Until your first cycle completes: the origin reference

The kits were extracted from a receivables-financing product whose first
feature through all four phases was a **KYC review agent** — an approval-gated
second reader for compliance analysts, built beside an existing manual
checker. What made it the bar:

- **Discovery** named one user (a compliance analyst mid-review, on a named
  screen), one trigger, one boundary — never "compliance staff need AI".
- **Design** decided everything on paper first: a twelve-field labeled output
  contract, approval-gated tools, an explicit no-memory decision with the
  reason written, five escalation triggers, and an eval set whose boundary
  case *ordered the agent to break a rule* so the refusal could be graded.
- **Develop** stayed inside a four-file allow-list for the entire build; the
  diff never left the contract, which made "the host app behaves identically
  with the flag off" verifiable rather than asserted. Its eval evidence ended
  at 45 pass · 2 partial · 0 fail across 47 checkable expectations — under
  honesty rules (no percentage while anything is ungraded; every non-pass
  reproduced in full; two expectations corrected because they were *wrong in
  the agent's favor*).
- **Three failure patterns it hit** that yours should expect: silent
  design-system drift (consistent enough that no single screen revealed it);
  fixture defects reading as findings (validity tests over fixtures ended
  it); and evidence rot (scoreboards describing builds that no longer
  existed — fixed with commit-stamped results and quotation tests).
- Its substrate existed **before** its agent — the two-slice default in the
  Design kit is that build's lesson, learned the long way.

## When your first feature ships, replace the above with:

```markdown
# The Worked Example — <feature name>

<The feature in two sentences, and its slug/branch.>

## Its discovery, design and build, in this process's shape
<The strongest rows quoted: the named user, the Part 2 verdict as written,
the memory decision, the approval point, the eval verdict line — each with
the file it comes from (docs/product/<slug>/...).>

## What each phase produced
<Links: discovery.md · design.md · develop.md · the manifest · the eval export.>

## The failure patterns it hit
<Honestly. These are what the next feature gets to skip.>
```

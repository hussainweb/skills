# Agent report format

Agents return a short, fixed-shape report so the orchestrator can relay it without
re-reading the work. Paste this into every agent prompt.

## The format

```
## Flags
<Anything that needs attention first: unsigned commits (list hashes), history rewrites,
a reverted deploy, a guard or gate bypassed, a security concern. "None" if none.>

## Shipped
- <bead id>: <one line> — <commit hash> <commit subject>
- ...

## Tests vs acceptance criteria
- <criterion from the bead>: met / not met — <which test or check shows it>

## Verified
<What was checked on the live or running system, and how (CI run, health check, curl).>

## Not verified
<What could not be checked and why (no browser, no production access).>

## Needs the user
<Decisions, visual reviews, credentials, pushes held behind a precondition. "Nothing" if nothing.>

## Beads
<Beads closed, hand-off notes left (on which beads), follow-ups filed (new ids).>
```

Keep it short. The details belong in the commits and the bead notes, not the report.

## Relaying a report to the user

Turn the report into a few plain lines, not a copy of it:

- Lead with the flags. An unsigned commit or a reverted deploy matters more than what shipped.
- Then what shipped, by bead, with hashes.
- Then what is unverified and what needs the user, in words a person skimming on a phone can
  act on.
- Say what happens next ("launching wave 2: app-43 and app-44").

Example:

> **app-41, app-42 landed** (a1b2c3d, e4f5a6b), CI green, health check OK.
> Two commits are unsigned — signing timed out (e4f5a6b, 9c8d7e6).
> Not verified: the role badge in the UI, since there's no browser here.
> Nothing needed from you yet. Launching app-43 now.

Before relaying, check anything that looks off against the repo — a commit that isn't on
the branch, a bead reported closed that `bd show` has open, CI that the report calls green
but isn't. Tell the user what you found either way.

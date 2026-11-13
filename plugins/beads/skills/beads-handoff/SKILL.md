---
name: beads-handoff
description: Close out the current conversation into beads (`bd`) so that a fresh conversation can pick up from beads alone. Reconciles bead status with what actually happened (closes, progress notes, claims), records everything the conversation produced that is worth tracking (new and deferred work, open questions, decisions, area knowledge, the rare memory), shows the plan for one confirmation, applies it, and ends with a short prompt to start the next conversation. Invoked only by the user via /beads-handoff; never trigger this on your own, even when a session looks finished or the context is filling up.
disable-model-invocation: true
argument-hint: "[what the next conversation should focus on]"
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Handing a conversation off to beads

The user is about to close this conversation and start a new one. Whatever this
conversation knows and beads doesn't is about to be lost: what was finished, what is half
done and where it stopped, what was decided and why, what turned up along the way. This
skill moves that into beads, so the next conversation starts with `bd prime` and
`bd show <id>` and loses nothing that mattered.

The test for the result is concrete: **a fresh agent, given only `bd prime` and the beads
this handoff names, can continue the work without asking the user what happened.** Every
step below serves that test, and the last step checks it.

The opposite failure matters just as much. A handoff is not a transcript dump. Each fact
goes to the one place a later agent will look for it, in as few words as will carry it, and
most of what was said in the conversation goes nowhere at all.

## Rules that hold throughout

- **Append notes, never replace them.** `bd note <id> "<text>"` appends. `bd update <id>
  --notes` replaces the whole notes field and destroys earlier sessions' notes. Never pass
  `--notes` to a bead that already has notes.
- **One confirmation, then apply.** Gather everything first and show the user one plan.
  Apply nothing before they confirm it, and apply exactly what they confirmed.
- **Knowledge attaches to beads that already exist.** Create a bead only for work (to do,
  deferred, or an open decision), never just to hold a fact.
- **Memories are rare.** `bd prime` injects every memory into every session, so a memory is
  a cost every future session pays. Most handoffs add none. The bar is in Phase 2.
- **Say what you could not verify.** If you are unsure whether something shipped, whether a
  test passed, or whether the user agreed to a decision, write it down as unverified rather
  than as fact. The next agent trusts notes more than it should.
- **Don't push or deploy.** Commits follow the user's standing instructions. Pushing
  (git or `bd dolt push`) happens only if the user's instructions or this conversation say so.

## Phase 1 — Gather state

Read the tracker and the working tree, so you compare the conversation against what is
actually recorded rather than what you remember recording:

```bash
bd list --status in_progress,blocked --json
bd memories --json
git status --short
git log --oneline -15
git stash list
```

Then `bd show <id>` for every bead the conversation touched: the ones you claimed, closed,
created, noted, or discussed by ID. Read their current description and notes; you are about
to add to them, and you need to know what they already say.

If the user passed an argument, it names what the next conversation should focus on. Keep
it in mind for Phase 5.

## Phase 2 — Inventory the conversation

Walk the conversation from the start and sort what it produced into the table below. Go by
what happened, not by what was planned: a bead that was claimed and abandoned is a status
fix, not "in progress".

| What the conversation produced | Where it goes |
|---|---|
| **Finished work** on a bead, verified | `bd close <id> --reason "<what shipped, commit hashes>"` |
| **Finished but unverified** (tests not run, deploy not checked) | Leave open. Note what was done and exactly what still needs checking |
| **Partly done work** | A resume note on its bead (below). Keep it `in_progress` if the next conversation continues it; otherwise set it back to `open` and say why |
| **Claimed or started, then dropped** | Back to `open` (`bd update <id> -s open`), with a note on why it stopped |
| **New work discovered** | `bd create` with a description that stands alone, and `--deps discovered-from:<id>` when it came out of another bead |
| **Work deliberately postponed** | Create it, or note it on its bead, with the reason; `bd defer <id> --until <date>` when there is a date to revisit |
| **An open question awaiting a decision** | A note on the bead it blocks, or `bd create -t decision` when it spans beads. Include the options discussed and any leaning |
| **A decision that was made** | A note on the bead it belongs to: what was decided, who decided, and why. If it changes the project's direction, it may also earn a memory |
| **Knowledge that matters for one area** | A dated note on that area's bead or epic. When no bead owns the area, a short entry in `.beads/KNOWLEDGE.md` |
| **Bead descriptions the work has made wrong** | `bd update <id> -d` / `--design` / `--acceptance`, only to correct what is now false, with a note saying what changed |
| **Uncommitted changes** | Commit per the user's standing instructions, or list them in the resume note as uncommitted |
| **A norm, convention, direction or cross-cutting contract** | `bd remember`, only if it passes the memory test below |

### The resume note

For each bead with work left, write one note that a fresh agent can act on:

```bash
bd note site-42 "2026-11-12 handoff. Done: migration and entity class (commit a1b2c3d). Left: the form handler; validation for role_id is not written. Next step: add the constraint in src/Form/RoleForm.php, then run the kernel tests (ddev phpunit --group site_roles), which were not run this session. Uncommitted: none. Watch out: the role list comes from code, not the DB, so don't add a foreign key (decided by the user today)."
```

Date it, say what is done with commit hashes, what is left, the very next step, how to
verify, what is uncommitted, and anything that would send the next agent the wrong way.
Leave out the story of how you got there.

### The memory test

Add or update a memory only when **a fresh agent, starting on an arbitrary bead in this
repo, would do something wrong without it**. Only these pass:

- norms and conventions for the project, and why they hold
- direction: architectural decisions, chosen trade-offs, things deliberately ruled out
- contracts between parts of the system that the code doesn't make obvious
- how the user wants sessions run

Never a memory:

- One-off bugs, gotchas and tool quirks. If one can recur, propose the lint rule, test, CI
  check, type or script that would catch it, and track that as work if the user agrees. If
  it can't recur, drop it.
- Mistakes in a skill's or tool's own docs. Offer to fix them at the source.
- Narrative learnings and investigation write-ups. They belong in the user's learning
  notes, not in beads.
- Anything already in code, comments, repo docs, git history or a bead.
- Anything that only matters for one area. That is a bead note.

Before proposing a memory, search the existing ones (`bd memories <keyword>`). If one
already covers it, propose updating it in place (`bd remember --key <key> "<text>"`) rather
than adding another.

### What goes nowhere

Most of the conversation: the route to a fix, dead ends that taught nothing durable, the
back-and-forth on wording, what any agent can see by reading the code or `git log`. When an
item is already recorded in the bead, the commit message or the docs, skip it.

## Phase 3 — Confirm the plan

Show the user the whole plan in one message, grouped by bead, so they can scan it:

```
## Handoff plan

site-42 Role form (in_progress → stays in_progress)
  note: resume note (done / left / next step / verify)
site-40 Role migration
  close: "Migration and entity shipped in a1b2c3d; kernel tests pass"
new: "Cache role list per user" (task, discovered-from site-42)
new: "Decide whether roles need a UI" (decision, blocks nothing yet)
memory (update `roles-in-code`): roles are defined in code; no roles table, no FK
not tracked: the phpunit flake we chased (it can't recur; the fixture was removed)
uncommitted: none
```

Show close reasons and memory text in full, because those are the writes that are hardest
to see afterwards. Show notes in full when short, or their first line. Where
AskUserQuestion is available, ask for confirmation with "Apply as shown" first; the user
can always type changes. Otherwise ask in plain text.

If the user changes something, apply their version without arguing. If they reject a
memory, it becomes a bead note where it still has value, or nothing.

## Phase 4 — Apply

Apply in an order that cannot lose anything:

1. Commits, if the user's instructions call for them, so the notes can name the hashes.
2. New beads and dependencies (`bd create`, `bd dep add`), so notes can reference their IDs.
3. Notes and description corrections on existing beads.
4. Status changes: closes, back-to-open, defers.
5. `.beads/KNOWLEDGE.md` entries, then memories (`bd remember`, updating in place where a
   key already exists).

Show each command as you run it. If a write fails, stop, say which, and do not continue
with writes that depended on it.

Then check the test the skill exists for. Run `bd prime` and `bd show <id>` for each bead
the next conversation is likely to start on, and read them as if this conversation did not
exist. If you could not continue from them alone, add the missing piece now.

## Phase 5 — Hand off

End with a short report and a prompt for the next conversation.

```
## Handoff

Closed: site-40
Updated: site-42 (resume note), site-37 (decision recorded)
Created: site-51 (task), site-52 (decision)
Memories: updated roles-in-code
Uncommitted / unpushed: nothing | <what, and why it was left>

Needs you: <decisions pending, things to check by eye, pushes held back>

### Start the next conversation with
Continue site-42. Run `bd show site-42` and pick up from the latest note.
```

The starting prompt points at beads instead of repeating them: a bead ID or two, and the
focus the user gave as the argument if any. If the next step is a choice between beads,
say `bd ready` and name the likely first pick. Keep it to a few lines; if it needs more,
that content belongs in a bead note.

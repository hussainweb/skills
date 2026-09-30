---
name: beads-trim-memories
description: Review every persistent beads memory (`bd memories`, the ones `bd prime` injects into each session), gather evidence on whether each is still true and still needed by every session, recommend a verdict per memory, and apply only what the user confirms. Occasional knowledge moves to a note on the bead it concerns, or to a committed knowledge file when no bead owns it. Invoked only by the user via /beads-trim-memories; never trigger this on your own, even when memories look stale.
disable-model-invocation: true
argument-hint: "[keyword to limit the review, e.g. deploy]"
allowed-tools: Bash, Read, Grep, Glob, Edit, Write, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Trimming beads memories

`bd prime` injects every persistent memory into every session. That makes the memory set a
tax that each session pays in context before it has done anything, and prime's caps only make
it worse: when a cap is set, memories are cut alphabetically, so what survives has nothing to
do with what matters. Memories are written in the moment, about the work of that moment, and
nobody comes back to ask whether they earned their place. This skill is that coming back.

The test for a memory that stays in prime is: **would a fresh agent, starting on an arbitrary
bead in this repo, do something wrong without it?** If the honest answer is "only when working
on X", the memory belongs with X, not in every session. If the answer is "no, that shipped",
it belongs nowhere.

The user runs this deliberately, and the user decides the fate of every memory. Your job is to
do the legwork they don't have time for (reading everything, checking each claim against the
repo, spotting duplicates) and to put a recommendation with evidence in front of them so each
decision takes seconds. Nothing is forgotten, rewritten or moved before they say so.

## Rules that hold throughout

- **Evidence before opinion.** Check what a memory claims against the repo and the beads
  before judging it. A memory that "looks stale" and one that names a file deleted three
  months ago are different things, and the user can only decide quickly on the second.
- **Recommend, don't decide.** Every verdict goes to the user with its evidence. When they
  choose differently from your recommendation, apply their choice without arguing. When they
  give a reason, that reason is worth more than the memory: if it explains why the memory is
  needed, offer to fold it into the memory's text.
- **Write the destination before forgetting the source.** A move is a copy followed by a
  forget. If anything fails in between, the memory still exists.
- **Forgetting is irreversible, so the report carries the text.** There is no `bd unforget`.
  The final report includes the full content of every forgotten memory, so the user can
  `bd remember` any of them back with one command.
- **Don't create beads to hold memories.** A new bead is work that shows up in `bd ready` and
  in every planning session. Knowledge attaches to beads that already exist.
- **When you can't judge, say so.** "No evidence either way" is a valid finding. Present it
  as such and let the user decide, rather than inventing a verdict.

## Phase 1 — Read everything

1. Read the memories from the source, not from prime:

   ```bash
   bd memories --json
   ```

   Prime's memory section can be capped and is sorted alphabetically, so it may not show
   every memory. The JSON output is the whole set, as `key: content` pairs (ignore
   `schema_version`). If the user passed a keyword as the argument, review only memories whose
   key or content matches it, and say that the rest were skipped.

   If there are no memories, say so and stop. There is nothing to trim.

2. Check whether prime is already eliding memories:

   ```bash
   bd config get prime.max-memories
   bd config get prime.max-memory-chars
   bd prime --memories-only | wc -c
   ```

   If a cap is set and the count exceeds it, tell the user up front: some memories are
   already not reaching sessions, chosen by key order. That is the strongest reason to trim,
   and it changes the framing of "keep" from "harmless" to "displaces something else".

3. Read the repo's `AGENTS.md`, `CLAUDE.md` and README (and anything they point to), and
   glance at `bd list --status open --type epic` for the open epics. You need to know what
   the project is and what its docs already say, because a memory that restates the docs is a
   duplicate, and a memory about an area is best placed on that area's epic.

## Phase 2 — Gather evidence per memory

For each memory, work out what it claims and run the cheap checks that bear on it. A few
commands per memory, not an investigation; the point is to hand the user facts they would
otherwise have to look up.

| The memory mentions | Check | What it tells you |
|---|---|---|
| A file, path, command, flag, env var, service | `grep -rn`, `ls`, `git log --oneline -3 -- <path>` | Whether it still exists, and when the area was last touched |
| A bead ID | `bd show <id>` | Whether that work is closed, and whether its notes already carry the same knowledge |
| A convention or rule | Search `AGENTS.md`, `CLAUDE.md`, `.beads/PRIME.md` | Whether the repo docs already say it |
| A decision | `bd search <topic>`, look for ADRs in `docs/` | Whether a bead note or ADR already records it |
| A tool, version or dependency | The lockfile, `composer.json`, `package.json`, etc. | Whether the version or tool it describes is still the one in use |
| Nothing checkable (a preference, a way of working) | Compare with other memories and the docs | Whether it duplicates or contradicts something |

Also read the memories against each other. Two memories that say one thing in different
words, or one that has been superseded by a later one, are the easiest wins and the user
rarely sees them because prime shows each in isolation.

Then classify each memory:

| Verdict | Meaning | Action when confirmed |
|---|---|---|
| **Keep** | Every session needs it: standing instructions, how the user wants sessions run, gotchas that bite anywhere in the repo | None |
| **Rewrite** | Still needed, but stale wording, too long, or several memories that should be one | `bd remember --key <key> "<new text>"`, then `bd forget` the ones merged into it |
| **Move to a bead** | Only relevant when working on a specific epic, area or bead, and a bead for it exists | `bd note <id> "<text>"`, then `bd forget <key>` |
| **Move to the knowledge file** | Occasionally relevant, but no existing bead owns the topic | Append to `.beads/KNOWLEDGE.md`, then `bd forget <key>` |
| **Drop** | About finished work, superseded, contradicted by the repo, or already in the repo docs | `bd forget <key>` |
| **Unsure** | You found no evidence either way | Ask; default to keep |

### Where occasional knowledge goes

Prefer, in this order:

1. **A note on an existing bead.** The epic or bead the memory is about, open or closed:
   `bd search` includes closed beads by default and `bd show` prints notes, so a note on a
   closed bead is still found by anyone searching the topic. For area knowledge, prefer the
   open epic or parent for that area, because that is what a planning session reads first.
   Write the note dated and with its origin, so a later reader knows where it came from and
   how much to trust it:

   ```bash
   bd note site-12 "2026-09-29, moved from memory staging-vpn: the staging database is only reachable over the office VPN; ddev's db-import will hang without it."
   ```

2. **The knowledge file**, `.beads/KNOWLEDGE.md`, committed to the repo, when no bead owns the
   topic. It sits beside `.beads/PRIME.md`, which is where beads already looks for per-repo
   customisation, and nothing in `.beads/.gitignore` excludes it. Organise it by topic
   heading, one short paragraph per entry, dated and with the memory key it came from. Create
   it the first time it is needed.

   The file is only useful if sessions know it exists, so the first time you create it, also
   store one pointer memory that stays in prime:

   ```bash
   bd remember "Occasional project knowledge lives in .beads/KNOWLEDGE.md, by topic. Read the section for an area before working in it; add to it rather than to bd remember when something only matters for one area." --key knowledge-file
   ```

   Beads' own prime text warns against MEMORY.md files because they fragment across accounts.
   That objection is about per-account files. A file committed in the repo is shared through
   git like everything else, and the pointer memory keeps it discoverable.

When both are possible, recommend the bead. Say which bead and why. The user may know the
area better and redirect you.

## Phase 3 — Ask the user

Present the memories in batches of related items (the same area, or the duplicates of one
another), a handful per round, so no round is a wall. For each memory show:

- the key and the content (in full when short, the first line otherwise),
- the evidence, in one line ("names `scripts/deploy.sh`, deleted in a1b2c3d in June"),
- the recommended verdict, and the destination for a move.

Where AskUserQuestion is available, ask one question per memory with the recommendation as
the first option, labelled as such, and the other verdicts as alternatives; the user can
always type something else. Where it isn't, list the batch and ask for answers by key.

Two orderings make a large set tractable:

- Put the clear-cut drops first (closed beads, deleted files, exact duplicates) as one batch
  the user can confirm in one go.
- Then the judgement calls, one at a time, with the most context-heavy last.

Do not apply anything until the round is answered, and do not apply a later round's verdicts
before asking it. The user may stop partway; whatever they have confirmed so far can be
applied, and the rest is reported as unreviewed.

## Phase 4 — Apply

Apply in the order that cannot lose anything:

1. Rewrites: `bd remember --key <key> "<text>"` updates in place.
2. Moves: write the bead note or the knowledge file entry, confirm it landed (`bd show <id>`
   or read the file back), then `bd forget <key>`.
3. Drops: `bd forget <key>`.
4. If the knowledge file was created or changed, add or update the pointer memory.

Show each command as you run it. If the knowledge file changed, leave the git commit to the
user unless their standing instructions or this session told you to commit; say either way.
Follow the repo's commit conventions when you do commit.

Finish by measuring the effect:

```bash
bd prime --memories-only | wc -c
```

## Phase 5 — Report

Use this structure so the user can skim it and can undo any single change.

```
## Memory review

Before: N memories, X chars in prime. After: N memories, X chars.

### Kept (n)
- key — one line on why

### Rewritten (n)
- key — what changed

### Moved (n)
- key → bead site-12 (note added) | .beads/KNOWLEDGE.md § Topic

### Forgotten (n)
- key — reason. Original text:
  > full content, so `bd remember "<content>" --key <key>` restores it

### Not reviewed (n)
- key — why (user stopped, argument filter, ...)

### Loose ends
- the knowledge file is uncommitted; commit it with ...
- anything the user said they would decide later
```

Lead the report with anything the user should act on, such as an uncommitted file or a memory
that contradicts the repo's docs and which you left in place at their request.

---
name: beads-init
description: >-
  Set up the beads (`bd`) issue tracker with this author's settings: `bd init` with its commit amended (auto-export off, JSONL and gate-lock files gitignored, role set after asking maintainer or contributor, AGENTS.md and CLAUDE.md cut to a pointer at the beads skill), or `bd bootstrap` on a fresh clone with the per-clone wiring redone and bootstrap's stray edits undone. Invoked only by the user via /beads-init; never trigger this on your own, even when a repo has no `.beads/` or a clone is missing its database.
disable-model-invocation: true
argument-hint: "[issue prefix, when initializing]"
allowed-tools: Bash, Read, Grep, Glob, Edit, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Initializing and bootstrapping beads

`bd init` does a lot in one go: it creates `.beads/`, installs git hooks, writes AGENTS.md,
CLAUDE.md and editor integrations, and **commits all of it itself**. There is no flag to skip
the commit (checked against bd 1.3.0), so the way to get the settings this author wants into
that commit is to apply them right after init and amend. `bd bootstrap` is the counterpart
for a clone that already tracks `.beads/`: it clones the Dolt database from the git origin,
but it does not restore the per-clone wiring, and it may edit a tracked file on the way.

This skill has two modes. Decide which one applies before running anything:

| State of the repo | Mode |
|---|---|
| No `.beads/` directory | **Initialize**: read `references/initialize.md` and follow it |
| `.beads/` is tracked by git, no `.beads/embeddeddolt/` or `.beads/dolt/` | **Bootstrap**: read `references/bootstrap.md` and follow it |
| `.beads/` with a database already present | Neither. Say it is already set up; `bd bootstrap` only validates here, and `bd init` refuses. Offer the settings step from `references/initialize.md` if the user wants the preferences applied to an old init. |

## Rules that hold throughout

- **Run from the repository root.** `cd "$(git rev-parse --show-toplevel)"` first. `bd`
  finds `.beads/` by walking up, but the files this skill edits are addressed from the root.
- **Never `bd init` over an existing `.beads/`.** Plain init refuses, but `--reinit-local`,
  `--force` and `--discard-remote` destroy local or remote data. A clone needs bootstrap, not
  init, and this skill never passes those flags.
- **Only bd's own files go into bd's commit.** `bd init` commits just what it created, even
  in a dirty tree. Keep it that way: stage the edited files by path, never `git add -A`, so
  the user's unrelated changes are not swept into the init commit.
- **Amend only the commit init just made.** Check that HEAD's subject is
  `bd init: initialize beads issue tracking` before `--amend`. If it isn't (init didn't
  commit for some reason), make a separate commit and say so.
- **Never push.** Report what is unpushed and stop.
- **Say what bd did, not what it was meant to do.** Quote the file list from
  `git show --stat`, the settings from `bd config get`, and the ignore results from
  `git check-ignore`; these are the checks, not the intentions.
- **bd auto-detects a non-TTY and goes non-interactive**, but pass `--non-interactive` and
  `--yes` explicitly so the behaviour does not depend on how the shell was spawned.

## What the author wants and why

| Setting | Where it lives | Why |
|---|---|---|
| `export.auto: false` | `.beads/config.yaml` (committed) | JSONL export is for viewers and interchange, not sync or backup. Off is bd's default, but the explicit line survives a default change and makes the choice visible. |
| `*.jsonl` ignored inside `.beads/` | `.beads/.gitignore` (committed) | `issues.jsonl`, `events.jsonl`, `interactions.jsonl` are derived from Dolt. bd does not ignore them because bootstrap can fall back to a tracked JSONL, but with export off and Dolt data pushed to the origin that fallback is never used. |
| `*.gate.lock*` ignored | root `.gitignore` and `.beads/.gitignore` (committed) | `.beads.gate.lock` in the root and `.beads/*.gate.lock` are runtime locks. bd 1.3.0 ignores them already; verify rather than assume, older inits did not. |
| `beads.role` | `.git/config` (**local, never committed**) | `maintainer` by default. When initializing, ask whether this is the user's own repo or a fork they contribute to, and use `contributor` for the fork; when bootstrapping, it is always `maintainer`. bd reads the role only from git config, not from `config.yaml`, which is why a fresh clone prints `warning: beads.role not configured (GH#2950)` on every command until it is set again. |
| AGENTS.md and CLAUDE.md are a short pointer | both files (committed) | Init writes a long beads section that repeats what `bd prime` prints and what the installed `beads` skill says. A pointer at `.agents/skills/beads/SKILL.md` keeps one source, the one bd maintains. Initialize only; text in `assets/agents-section.md`. |
| `.beads/` mode `0700` | filesystem (local) | bd warns on every command when the directory is group-readable. Init creates it 0700; `git clone` creates it with the umask. |

## Report

```
## Beads <initialized | bootstrapped> in <repo>

bd <version>, prefix <prefix> (initialize only)

### What bd did
- init committed N files as <hash> "bd init: initialize beads issue tracking": .beads/, hooks, AGENTS.md, CLAUDE.md, <editor integrations>
  | bootstrap cloned database <name> from <origin> (<n> chunks)

### Settings applied
- export.auto = false (config.yaml, in the commit)
- .beads/*.jsonl ignored (.beads/.gitignore, in the commit)   | already ignored by bd
- *.gate.lock* ignored (root and .beads/.gitignore)           | already ignored by bd
- beads.role = <maintainer | contributor> (local git config, not committed)
- .beads mode 700
- AGENTS.md and CLAUDE.md reduced to the beads-skill pointer (in the commit; initialize only)
- git hooks installed to .git/hooks (bootstrap only)

### Footprint (bootstrap only)
- reverted .beads/config.yaml (bootstrap added sync.remote; bd re-adds it on first push)
- working tree otherwise as before

### Verified
- bd ready runs with no warnings; git check-ignore confirms the four paths

### Not done
- nothing pushed
- <prefix or role chosen without asking, --skip-agents not used, hooks skipped at the user's request, ...>
```

Lead with anything that needs the user's attention: a prefix or role chosen by default, a file
bootstrap changed that you reverted, or a plan that would have created an empty database.

---
name: beads-init
description: >-
  Set up the beads (`bd`) issue tracker with this author's settings: `bd init` with its commit amended (auto-export off, JSONL and gate-lock files gitignored, role set after asking maintainer or contributor, AGENTS.md and CLAUDE.md cut to a pointer at the beads skill), `bd bootstrap` on a fresh clone with the per-clone wiring redone, ignore patterns bd added kept and committed, and its other stray edits undone, or completing a repo that already has `.beads/` but is missing some of that (editor integrations skipped, settings never applied, an older init). Invoked only by the user via /beads-init; never trigger this on your own, even when a repo has no `.beads/` or a clone is missing its database.
disable-model-invocation: true
argument-hint: "[issue prefix, when initializing]"
allowed-tools: Bash, Read, Grep, Glob, Edit, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.2.0"
---

# Initializing, bootstrapping and completing beads

`bd init` does a lot in one go: it creates `.beads/`, installs git hooks, writes AGENTS.md,
CLAUDE.md and editor integrations, and **commits all of it itself**. There is no flag to skip
the commit (checked against bd 1.3.1), so the way to get the settings this author wants into
that commit is to apply them right after init and amend. `bd bootstrap` is the counterpart
for a clone that already tracks `.beads/`: it clones the Dolt database from the git origin,
but it does not restore the per-clone wiring, and it may edit a tracked file on the way:
ignore patterns it appends are kept and committed, anything else it changes is reverted.
A repo can also sit between the two: `.beads/` and its database exist, but some of what init
would have written is missing (`--skip-agents`, `--skip-hooks`, an init older than the skill
installer, or this skill's settings never applied). `bd init` refuses to run there, and the
pieces it would have written are installed one at a time with `bd setup <tool>`,
`bd hooks install` and `bd config set`, none of which commit.

This skill has three modes. Decide which one applies before running anything, from three
facts gathered at the repo root:

```bash
cd "$(git rev-parse --show-toplevel)"
ls -A .beads 2>/dev/null | head -3                   # exists, and not empty?
git ls-files .beads | head -1                        # tracked by git?
ls -d .beads/embeddeddolt .beads/dolt 2>/dev/null    # database present?
```

| `.beads/` | Tracked | Database | Mode |
|---|---|---|---|
| missing or empty | – | – | **Initialize**: read `references/initialize.md` and follow it |
| present | yes | no | **Bootstrap**: read `references/bootstrap.md` and follow it, then run the audit in `references/complete.md` |
| present | yes or no | yes | **Complete**: read `references/complete.md` and follow it. This covers the repo that is fully set up (the audit passes and nothing changes) and the one that is only partly set up |
| present, has `config.yaml` | no | no | Broken or half-made (an init that was interrupted, or files copied in). Stop, show `ls -la .beads` and `git status --porcelain .beads`, and ask; do not guess at init or bootstrap |

The presence of `.beads/` alone says nothing about the editor integrations, the hooks or the
settings: a `.beads/` without `.agents/skills/beads/` is the Complete case, not a reason to
look for another way to run init.

## Rules that hold throughout

- **Run from the repository root.** `cd "$(git rev-parse --show-toplevel)"` first. `bd`
  finds `.beads/` by walking up, but the files this skill edits are addressed from the root.
- **Never `bd init` over an existing `.beads/`.** Plain init refuses, but `--reinit-local`,
  `--force` and `--discard-remote` destroy local or remote data. A clone needs bootstrap, not
  init; a partial setup needs Complete; this skill never passes those flags.
  `--init-if-missing` only exits 0 without doing anything, so it is no way in either.
- **Every `bd setup <tool>` runs in this repo's root, once, and only when its `--check`
  failed.** `bd setup` writes into whatever directory it runs in, with or without a beads
  workspace, so running it in a scratch directory to "see what it does" litters that
  directory and tells you nothing about this repo; what each recipe writes is listed in
  `references/complete.md`. Re-running it over a file that already has its section appends
  the long block again.
- **`bd setup <tool> --check` reporting "no beads section found" is the target state, not a
  failure.** The pointer this skill writes carries no `<!-- BEGIN BEADS ... -->` marker on
  purpose, so the check cannot see it. Read the other lines of the check (skill, hooks,
  settings) and ignore that one; never run `bd setup` to satisfy it.
- **Only bd's own files go into bd's commit.** `bd init` commits just what it created, even
  in a dirty tree. Keep it that way: stage the edited files by path, never `git add -A`, so
  the user's unrelated changes are not swept into the init commit.
- **Amend only the commit init just made.** Check that HEAD's subject is
  `bd init: initialize beads issue tracking` before `--amend`. If it isn't (init didn't
  commit for some reason, or this is Complete mode), make a separate commit and say so.
- **Never push.** Report what is unpushed and stop.
- **Say what bd did, not what it was meant to do.** Quote the file list from
  `git show --stat`, the settings from `.beads/config.yaml`, and the ignore results from
  `git check-ignore`; these are the checks, not the intentions. (`bd config get export.auto`
  prints `false` whether the line is set or merely defaulted, so grep the file.)
- **bd auto-detects a non-TTY and goes non-interactive**, but pass `--non-interactive` and
  `--yes` explicitly so the behaviour does not depend on how the shell was spawned.

## What the author wants and why

| Setting | Where it lives | Why |
|---|---|---|
| `export.auto: false` | `.beads/config.yaml` (committed) | JSONL export is for viewers and interchange, not sync or backup. Off is bd's default, but the explicit line survives a default change and makes the choice visible. |
| `*.jsonl` ignored inside `.beads/` | `.beads/.gitignore` (committed) | `issues.jsonl`, `events.jsonl`, `interactions.jsonl` are derived from Dolt. bd does not ignore them because bootstrap can fall back to a tracked JSONL, but with export off and Dolt data pushed to the origin that fallback is never used. |
| `*.gate.lock*` ignored | root `.gitignore` and `.beads/.gitignore` (committed) | `.beads.gate.lock` in the root and `.beads/*.gate.lock` are runtime locks. bd 1.3.x ignores them already; verify rather than assume, older inits did not. |
| Ignore patterns bd adds later | `.beads/.gitignore` and root `.gitignore` (committed) | A newer bd may append patterns it now requires, marked `# Added by bd (missing required patterns)` (1.3.1 adds `dolt-server-config.yaml` on bootstrap). They are bd's own files that bd wants out of the repo, so they belong in the ignore file: keep them and commit them, so the next clone's bootstrap finds nothing to add. |
| `beads.role` | `.git/config` (**local, never committed**) | `maintainer` by default. When initializing or completing, ask whether this is the user's own repo or a fork they contribute to, and use `contributor` for the fork; when bootstrapping, it is always `maintainer`; when completing a repo where it is already set, keep it. bd reads the role only from git config, not from `config.yaml`, which is why a fresh clone prints `warning: beads.role not configured (GH#2950)` on every command until it is set again. |
| Editor integrations present | `.agents/skills/beads/`, `.claude/settings.json`, `.codex/`, `.cursor/` (committed) | What `bd init` installs unless `--skip-agents`: the `beads` skill the pointer below refers to, plus the session hooks that run `bd prime`. Without the skill the pointer points at nothing. Unless the user has said they don't want them, they belong in the repo. |
| AGENTS.md and CLAUDE.md are a short pointer | both files (committed) | Init writes a long beads section that repeats what `bd prime` prints and what the installed `beads` skill says. A pointer at `.agents/skills/beads/SKILL.md` keeps one source, the one bd maintains. Initialize and Complete; text in `assets/agents-section.md`. |
| Git hooks installed | `.beads/hooks/` (committed) and `core.hooksPath` (local) | Init installs them unless `--skip-hooks`; a clone has the files but not the config. `bd hooks list` shows which. |
| `.beads/` mode `0700` | filesystem (local) | bd warns on every command when the directory is group-readable. Init creates it 0700; `git clone` creates it with the umask. |

## Report

```
## Beads <initialized | bootstrapped | completed> in <repo>

bd <version>, prefix <prefix> (initialize only)

### What bd did
- init committed N files as <hash> "bd init: initialize beads issue tracking": .beads/, hooks, AGENTS.md, CLAUDE.md, <editor integrations>
  | bootstrap cloned database <name> from <origin> (<n> chunks)
  | complete: found <what was missing>; bd setup <tools> wrote <files>; bd hooks install

### Settings applied
- export.auto = false (config.yaml, in the commit)
- .beads/*.jsonl ignored (.beads/.gitignore, in the commit)   | already ignored by bd
- *.gate.lock* ignored (root and .beads/.gitignore)           | already ignored by bd
- beads.role = <maintainer | contributor> (local git config, not committed)
- .beads mode 700
- AGENTS.md and CLAUDE.md reduced to the beads-skill pointer (in the commit; initialize and complete)
- git hooks installed to .git/hooks (bootstrap only)
- committed as <hash> "chore(beads): complete the beads setup" (complete only; or "nothing to commit, already set up")

### Footprint (bootstrap only)
- kept the ignore patterns bd <version> appended to <.beads/.gitignore | .gitignore>, committed as <hash> "chore(beads): ignore <pattern> added by bd bootstrap"
- reverted .beads/config.yaml (bootstrap added sync.remote; bd re-adds it on first push)
- working tree otherwise as before

### Verified
- bd ready runs with no warnings; git check-ignore confirms the four paths; bd setup --check shows skill, hooks and settings present (its "no beads section" line is the pointer, expected)

### Not done
- nothing pushed
- <prefix or role chosen without asking, --skip-agents not used, hooks skipped at the user's request, ...>
```

Lead with anything that needs the user's attention: a prefix or role chosen by default, a file
bootstrap changed that you reverted or committed, a plan that would have created an empty database, or a
state the decision table told you to stop and ask about.

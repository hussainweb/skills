Read this from `beads-init/SKILL.md` when `.beads/` exists with its database, or right after a
bootstrap. The rules and the settings table in SKILL.md apply throughout; the report template
is there too.

# Complete a repo that already has `.beads/`

`bd init` has already run here, or a bootstrap just did. It cannot run again, and nothing
needs it to: everything it writes besides the database is installed piecemeal by `bd setup
<tool>`, `bd hooks install` and `bd config set`, and the settings this skill adds are plain
file edits. None of those commit, so this mode ends with its own commit instead of an amend.

This mode is an audit followed by fixes for what the audit found. On a repo this skill set
up, the audit passes and the mode ends with "already set up"; on one initialized with
`--skip-agents`, `--skip-hooks`, or an older bd, or one that never had the settings applied,
it fills the gaps and nothing else. Do not look for a way to re-run init, and do not run any
`bd setup` outside this repo to see what it would write; the table in C3 says what each
recipe writes.

## C1. Check the ground

```bash
cd "$(git rev-parse --show-toplevel)"
bd version
ls -d .beads/embeddeddolt .beads/dolt 2>/dev/null    # one of these: the database is here
git ls-files .beads | head -3                        # tracked?
git status --porcelain > /tmp/beads-complete-before  # snapshot; anything new afterwards is this mode's
git log -1 --format=%s                               # remember HEAD; the commit lands on top of it
```

**If `.beads/` is not tracked**, init's commit never landed or the repo was set up in stealth
mode. Tell them apart with `git check-ignore -v .beads/config.yaml`: a match from
`.git/info/exclude` or `.gitignore` is stealth, a deliberate choice to keep beads out of the
repo, and this skill's committed settings make no sense there; stop and say so. No match
means an uncommitted init; stop, show `git status --porcelain .beads`, and ask whether to
commit bd's files (init would have, and the rest of this mode assumes it) or leave them
local. Do not continue until the user answers.

## C2. Audit

Run every check and note each one that fails; that list is the plan and goes in the report.

```bash
grep -nE '^export:' -A1 .beads/config.yaml           # want "export:" then "  auto: false" (the commented "# export:" does not count)
git check-ignore -v .beads/issues.jsonl .beads/events.jsonl .beads.gate.lock .beads/dolt.gate.lock
git config beads.role                                # maintainer or contributor; empty means unset
stat -c %a .beads                                    # 700
bd hooks list                                        # ✓ installed (shim <version>) or ✗ not installed
for r in claude codex cursor; do echo "== $r"; bd setup $r --check; done
grep -L 'Track tasks in beads, not in TODO lists' AGENTS.md CLAUDE.md 2>&1   # files without the pointer (or missing)
grep -l 'BEGIN BEADS' AGENTS.md CLAUDE.md 2>/dev/null                          # files still carrying bd's long block
```

Reading the `--check` output: the lines about the skill (`.agents/skills/beads/SKILL.md`),
hooks (`.claude/settings.json`, `.codex/hooks.json`, `.cursor/hooks.json`) and Cursor rules
are the ones that matter. "exists but no beads section found" against AGENTS.md or CLAUDE.md
is what the pointer looks like to bd and is the target state; it is a failure only when the
pointer is also missing, which the `grep -L` line tells you.

Settle the role. If `git config beads.role` is already set, keep it; the user set it, and
changing it is not what they asked. If it is empty, ask as in Initialize: maintainer first
and marked as the default, contributor for a fork of someone else's project; where
AskUserQuestion is unavailable, use maintainer and say so in the report.

Settle the integrations. They are what init installs unless `--skip-agents`, and the pointer
in AGENTS.md and CLAUDE.md points at the skill they contain, so install the missing ones
unless the user has said they don't want the editor integrations; if they have, skip C3 and
C4 and say so in the report. The same goes for hooks and `--skip-hooks`.

If every check passes, skip to C6: report "already set up" and change nothing.

## C3. Install what is missing

Each `bd setup <recipe>` writes only its own files and leaves an existing file's other
content alone, so run only the recipes whose `--check` failed, each once, from the root:

| Recipe | Writes | On an existing AGENTS.md / CLAUDE.md |
|---|---|---|
| `bd setup claude` | `.claude/settings.json` (SessionStart hook running `bd prime --hook-json`), `CLAUDE.md` | appends a `BEGIN/END BEADS INTEGRATION` block; creates the file with a template around it if absent |
| `bd setup codex` | `.agents/skills/beads/` (the `beads` skill), `.codex/config.toml`, `.codex/hooks.json`, `AGENTS.md` | appends a `BEGIN/END BEADS CODEX SETUP` block; creates the file with a `# Codex Instructions` heading if absent |
| `bd setup cursor` | `.cursor/rules/beads.mdc`, `.cursor/hooks.json`, and the same `.agents/skills/beads/` | nothing |

```bash
bd setup claude          # only if its --check failed on hooks or settings
bd setup codex           # only if its --check failed on the skill or the Codex hooks
bd setup cursor          # only if its --check failed on rules, hooks or the skill
bd hooks install         # only if bd hooks list showed "not installed"
git status --porcelain | diff /tmp/beads-complete-before -    # expect only the files in the table
```

A recipe that was already installed is not re-run even if its `--check` complained about the
missing section: that complaint is the pointer (see C2), and re-running would append the long
block next to it.

## C4. Apply the settings

Each line checks before it writes, so lines whose check passed in C2 do nothing:

```bash
grep -qE '^export:' .beads/config.yaml || bd config set export.auto false
sed -i -e '$a\' .beads/config.yaml         # newline at EOF only if missing (older bd omitted it)

git check-ignore -q .beads/issues.jsonl || printf '\n# JSONL exports (issues, events, interactions) are derived from Dolt, not source\n*.jsonl\n' >> .beads/.gitignore
git check-ignore -q .beads.gate.lock     || printf '*.gate.lock*\n' >> .gitignore
git check-ignore -q .beads/dolt.gate.lock || printf '*.gate.lock*\n' >> .beads/.gitignore

[ -n "$(git config beads.role)" ] || git config beads.role <role>   # the role settled in C2
[ "$(stat -c %a .beads)" = 700 ] || chmod 700 .beads
```

`.beads/.gitignore` carries bd's note not to add negation patterns; these are all positive
patterns, so that is respected. Do not edit anything else in the files bd wrote.

## C5. Rewrite AGENTS.md and CLAUDE.md

The target is the same as in Initialize: both files carry the pointer from
`assets/agents-section.md`, neither carries a `BEGIN/END BEADS` block. What to do depends on
where each file came from:

```bash
for f in AGENTS.md CLAUDE.md; do
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 || grep -q " $f\$" /tmp/beads-complete-before || echo "$f: created by bd setup in C3"
done
```

- **Created by `bd setup` in C3** (neither tracked nor in the snapshot): everything in it is
  bd's boilerplate. Replace the whole file with the asset.

  ```bash
  cp <skill-dir>/assets/agents-section.md AGENTS.md    # and/or CLAUDE.md
  ```

- **Existed before** (tracked, or untracked but in the snapshot): the rest of the file is the
  user's. Remove the marked blocks if any, trim trailing blank lines, and append the asset
  only if the pointer is not already there:

  ```bash
  for f in AGENTS.md CLAUDE.md; do
    [ -e "$f" ] || cp <skill-dir>/assets/agents-section.md "$f"
    sed -i -e '/<!-- BEGIN BEADS INTEGRATION/,/<!-- END BEADS INTEGRATION -->/d' \
           -e '/<!-- BEGIN BEADS CODEX SETUP/,/<!-- END BEADS CODEX SETUP -->/d' "$f"
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$f"      # drop trailing blank lines
    grep -q 'Track tasks in beads, not in TODO lists' "$f" || { printf '\n' >> "$f"; cat <skill-dir>/assets/agents-section.md >> "$f"; }
  done
  git diff -- AGENTS.md CLAUDE.md                      # expect: blocks removed, pointer appended, nothing else
  ```

  If a file already had a beads section of the user's own, leave that alone and ask whether
  they want the pointer as well.

`.cursor/rules/beads.mdc` carries the long text for Cursor. It is not part of this request;
leave it as `bd setup cursor` wrote it.

## C6. Commit

There is no init commit to amend. Stage only the files this mode touched, by path, and
commit them on their own:

```bash
git status --porcelain | diff /tmp/beads-complete-before -        # the full list of what changed
git add .beads/.gitignore .beads/config.yaml .gitignore AGENTS.md CLAUDE.md \
        .agents/skills/beads .claude/settings.json .codex/config.toml .codex/hooks.json \
        .cursor/hooks.json .cursor/rules/beads.mdc 2>/dev/null      # only paths that exist and changed are staged
git diff --cached --stat
git commit -m "chore(beads): complete the beads setup" -m "<one line per gap the audit found and what filled it>"
```

Anything in the diff against the snapshot that is not in that list was not written by this
mode: leave it unstaged and name it in the report. If `git diff --cached` is empty, there is
nothing to commit; say "already set up" and skip the commit.

## C7. Verify

```bash
grep -nE '^export:' -A1 .beads/config.yaml           # export: / auto: false
git check-ignore -v .beads/issues.jsonl .beads/events.jsonl .beads.gate.lock .beads/dolt.gate.lock
git config beads.role
stat -c %a .beads                                    # 700
bd hooks list                                        # all ✓
for r in claude codex cursor; do bd setup $r --check; done   # skill, hooks, rules ✓; "no beads section" is the pointer
grep -c 'Track tasks in beads, not in TODO lists' AGENTS.md CLAUDE.md   # 1 and 1
grep -l 'BEGIN BEADS' AGENTS.md CLAUDE.md            # nothing
git status --porcelain | diff /tmp/beads-complete-before -   # empty
bd ready                                             # runs; no "beads.role" or permissions warning
```

Then report (template in SKILL.md), leading with what the audit found missing. Mention that
nothing is pushed.

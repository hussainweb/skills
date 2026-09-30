Read this from `beads-init/SKILL.md` when the repo has no `.beads/` yet. The rules and the
settings table in SKILL.md apply throughout; the report template is there too.

# Initialize a repo that has no `.beads/`

## A1. Check the ground

```bash
cd "$(git rev-parse --show-toplevel)"
bd version
test ! -e .beads && echo "no .beads: initialize"
git status --porcelain          # remember this; init must not change it beyond its own files
git log -1 --format=%s          # remember HEAD; the init commit lands on top of it
```

Settle the issue prefix. Use the argument if one was given, otherwise bd's default, which is
the directory name. If the directory name is long, has punctuation, or is something generic
like `src` or `site`, propose a short one (every issue ID is `<prefix>-<hash>`, so short
wins) and ask; where AskUserQuestion is unavailable, use the directory name and say so in the
report. If the user has said they don't want the editor integrations (CLAUDE.md, `.claude/`,
`.codex/`, `.cursor/`, `.agents/`), add `--skip-agents`; otherwise leave them, since the
request is "the way init does it, with my settings".

Settle the role. Maintainer is the default and the right answer for the user's own repos,
but a fork of someone else's project wants `contributor`, which changes how `bd prime`
frames commits and pushes and is what bd's contributor setup assumes. The two look the same
from inside the directory, so ask rather than guess: one question, maintainer first and
marked as the default, contributor as the alternative, unless the user has already said which
this is (a fork, "I'm contributing to X", an `upstream` remote is a strong hint to at least
ask). Where AskUserQuestion is unavailable, use maintainer and say so in the report. The
role is per clone (it lives in `.git/config`), so this only decides the machine you are on.

## A2. Run init

```bash
bd init --non-interactive --role <maintainer|contributor> -p <prefix>
git log -1 --format=%s            # expect: bd init: initialize beads issue tracking
git show --stat --format= HEAD    # what it committed
git status --porcelain            # expect: unchanged from A1
```

Init writes and commits `.beads/` (config, hooks, README, `.gitignore`), the root
`.gitignore` block, AGENTS.md and CLAUDE.md (appending a marked section when they exist),
and the editor integrations. It sets `core.hooksPath` to `.beads/hooks` and
`beads.role` in the local git config. Everything it commits is its own; if `git status`
shows something new that is not ignored, stop and look before going on.

## A3. Apply the settings

```bash
bd config set export.auto false            # appends to .beads/config.yaml, no trailing newline
sed -i -e '$a\' .beads/config.yaml         # add the newline only if missing

git check-ignore -q .beads/issues.jsonl || printf '\n# JSONL exports (issues, events, interactions) are derived from Dolt, not source\n*.jsonl\n' >> .beads/.gitignore
git check-ignore -q .beads.gate.lock     || printf '*.gate.lock*\n' >> .gitignore
git check-ignore -q .beads/dolt.gate.lock || printf '*.gate.lock*\n' >> .beads/.gitignore

[ "$(git config beads.role)" = <role> ] || git config beads.role <role>   # the role settled in A1
chmod 700 .beads
```

`.beads/.gitignore` carries bd's note not to add negation patterns; these are all positive
patterns, so that is respected. Do not edit anything else in the files bd wrote.

## A4. Rewrite AGENTS.md and CLAUDE.md

Init writes a long beads section into both files (a command cheat sheet, shell tips about
non-interactive flags, context profiles, a session-close protocol) and, for a fresh
AGENTS.md, a second block from the Codex setup. Almost all of it repeats what `bd prime`
prints at session start and what the `beads` skill init installs at
`.agents/skills/beads/SKILL.md` already says. The author wants both files reduced to a short
pointer at that skill, so agents read one thing and it is the thing bd keeps current.

The replacement text is `assets/agents-section.md` in this skill. What to do with it depends
on whether init created the file or appended to one that already existed:

```bash
git show --name-status --format= HEAD | grep -E 'AGENTS.md|CLAUDE.md'   # A = init created it, M = init appended
```

- **Created by init (`A`):** everything in it is init's boilerplate. Replace the whole file
  with the asset.

  ```bash
  cp <skill-dir>/assets/agents-section.md AGENTS.md
  cp <skill-dir>/assets/agents-section.md CLAUDE.md
  ```

- **Appended to by init (`M`):** the rest of the file is the user's. Remove only the two
  marked blocks, trim the blank lines they leave at the end, and append the asset:

  ```bash
  for f in AGENTS.md CLAUDE.md; do
    sed -i -e '/<!-- BEGIN BEADS INTEGRATION/,/<!-- END BEADS INTEGRATION -->/d' \
           -e '/<!-- BEGIN BEADS CODEX SETUP/,/<!-- END BEADS CODEX SETUP -->/d' "$f"
    sed -i -e :a -e '/^\n*$/{$d;N;ba' -e '}' "$f"      # drop trailing blank lines
    printf '\n' >> "$f"
    cat <skill-dir>/assets/agents-section.md >> "$f"
  done
  git diff HEAD~1 -- AGENTS.md CLAUDE.md                # expect: only the appended section
  ```

  If a file already had a beads section of the user's own before init, leave that alone and
  ask whether they want the pointer as well.

Two consequences to know about, neither needing action:

- The pointer carries no `<!-- BEGIN BEADS ... -->` marker on purpose. With a marker, bd
  treats the block as its own and a later `bd setup claude` or `bd setup codex` would
  "upgrade" it back to the long version. Without one, `bd setup <tool> --check` reports
  "no beads section found", which is accurate and harmless; nothing runs those checks on its
  own.
- If init ran with `--skip-agents`, there are no files to rewrite and no installed skill to
  point at, so skip this step.

`.cursor/rules/beads.mdc` carries the same long text for Cursor. It is not part of this
request; leave it unless the user asks.

## A5. Amend the init commit

```bash
git add .beads/.gitignore .beads/config.yaml .gitignore AGENTS.md CLAUDE.md
git commit --amend --no-edit
```

The beads hooks run on the amend (`prepare-commit-msg`, `pre-commit`) and add nothing to the
message. Confirm there is still one init commit on top of the earlier HEAD, and that the edited
files are in it:

```bash
git log --oneline -3
git show --stat --format= HEAD | grep -E 'gitignore|config.yaml|AGENTS|CLAUDE'
```

## A6. Verify

```bash
bd config get export.auto                           # false
git check-ignore -v .beads/issues.jsonl .beads/events.jsonl .beads.gate.lock .beads/dolt.gate.lock
git config beads.role                               # the role settled in A1
stat -c %a .beads                                   # 700
bd ready                                            # runs; no "beads.role" or permissions warning
```

Then report (template in SKILL.md). Mention that nothing is pushed, and that the first
`bd dolt push` after a git origin exists will itself commit `sync.remote` into
`config.yaml`; that is bd's doing and expected.

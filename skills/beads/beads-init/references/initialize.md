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

## A4. Amend the init commit

```bash
git add .beads/.gitignore .beads/config.yaml .gitignore
git commit --amend --no-edit
```

The beads hooks run on the amend (`prepare-commit-msg`, `pre-commit`) and add nothing to the
message. Confirm there is still one init commit on top of the earlier HEAD, and that the three
files are in it:

```bash
git log --oneline -3
git show --stat --format= HEAD | grep -E 'gitignore|config.yaml'
```

## A5. Verify

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

Read this from `beads-init/SKILL.md` when `.beads/` is tracked but the database is missing. The
rules and the settings table in SKILL.md apply throughout; the report template is there too.

# Bootstrap a fresh clone

## B1. Check the ground

```bash
cd "$(git rev-parse --show-toplevel)"
bd version
git ls-files .beads | head -3                        # tracked: this repo already uses beads
ls -d .beads/embeddeddolt .beads/dolt 2>/dev/null    # absent: needs bootstrap
git status --porcelain > /tmp/beads-bootstrap-before # snapshot; anything new afterwards is bootstrap's
git ls-remote origin 'refs/dolt/*'                   # refs/dolt/data means the origin carries the database
chmod 700 .beads
```

If `refs/dolt/data` is not on the origin and `config.yaml` has no `sync.remote`, bootstrap's
plan will be "create a fresh one" or "import from JSONL". A fresh empty database is not what
the user asked for: stop, show the plan, and ask where the data is (a Dolt remote, a machine
that never ran `bd dolt push`, a tracked JSONL). Do not let bootstrap create an empty
database silently.

## B2. Bootstrap

```bash
bd bootstrap --dry-run      # show the plan; expect "clone from remote" naming the git origin
bd bootstrap --yes
```

## B3. Redo the per-clone wiring

Init did these on the original machine and they live in `.git/` only, so the clone has none
of them:

```bash
git config beads.role maintainer
bd hooks install            # shims into .git/hooks; tracked files untouched
bd hooks list
```

If the user has said they don't want the git hooks, skip `bd hooks install` and say so.

## B4. Undo bootstrap's footprint

The only thing bootstrap should have added is the database under `.beads/embeddeddolt/` (ignored) and its lock files (ignored).

```bash
git status --porcelain | diff /tmp/beads-bootstrap-before -
```

- **`.beads/config.yaml` modified, adding only `sync.remote`:** bootstrap wrote the origin
  URL because it was not committed yet. Revert it with `git checkout -- .beads/config.yaml`.
  Nothing is lost: bootstrap and `bd dolt push` both detect the remote from the git origin,
  and the first push commits `sync.remote` itself. Say in the report that this happened.
- **Any other tracked file changed:** show the diff, revert it (`git checkout -- <file>`),
  and report it. Only revert files that were clean in the B1 snapshot; a file the user had
  already modified is theirs.
- **New untracked, non-ignored files:** list them in the report and leave them; deleting is
  the user's call.

## B5. Verify

```bash
git status --porcelain | diff /tmp/beads-bootstrap-before -   # empty
git config beads.role                                          # maintainer
bd ready                                                       # runs; no warnings
```

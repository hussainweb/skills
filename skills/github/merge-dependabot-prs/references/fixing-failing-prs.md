# Fixing a failing Dependabot PR

A bump with red checks usually needs a small change alongside it: a renamed import, a
changed config key, a type that tightened, a snapshot that moved. The fix belongs in the
same PR as the bump, as its own commit on the Dependabot branch. Merged with `--rebase`,
the bump and the fix land as two adjacent commits on the base, so anyone reading the
history later sees what the upgrade needed and why. Don't commit the fix to the base branch
on its own: it then lands apart from the bump that made it necessary, and the PR still
can't merge until Dependabot rebuilds it.

Only start after the user says yes, and only on the PRs they pick.

## 1. Diagnose before changing anything

```bash
gh pr checks <n>                                   # which checks failed
gh run view <run-id> --log-failed                  # the failing step's output
```

Decide whose failure it is:

- **The bump broke it.** The error names the dependency, an API it changed, or code that
  calls it. Fix it on the PR branch, below.
- **The base is already red with the same failure.** Check the latest run on `BASE`
  (`gh run list --branch "$BASE" --limit 5`). The fix isn't the bump's, so it doesn't
  belong in this PR. Say so, and offer to fix it on the base separately.
- **Flaky or infrastructure** (timeouts, a registry outage, a runner that died). Rerun the
  failed jobs (`gh run rerun <run-id> --failed`) instead of changing code. Rerunning needs
  no confirmation.
- **The fix is large** (a migration across many files, a rewritten config, a behaviour
  change someone has to decide on). Stop and describe it; that is a piece of work, not a
  fix-up commit.

## 2. Work in a separate worktree

Don't switch the user's checkout or touch their uncommitted work. Check the PR branch out
in a temporary worktree:

```bash
branch=$(gh pr view <n> --json headRefName --jq .headRefName)
git fetch origin "$branch"
wt=$(mktemp -d)
git worktree add "$wt" -B "$branch" "origin/$branch"
cd "$wt"
```

Don't rebase the branch. The fix goes on top of Dependabot's commit as it is, and the
`--rebase` merge puts both onto the base.

## 3. Fix, verify locally, commit

Reproduce the failure locally where the toolchain allows it, make the smallest change that
fixes it, and rerun the failing command until it passes. Keep the change to what the bump
needs: no unrelated cleanups, no other dependency changes.

Commit it on its own, with a message that says what the upgrade required, following the
repository's commit conventions. For example:

```
fix(deps): adapt to vitest 3 config changes

vitest 3 drops `test.coverage.all`; coverage now includes every file by default.
```

## 4. Push

```bash
git push origin "$branch"
cd - && git worktree remove "$wt"
```

A plain push, never a force push. If it's rejected because Dependabot pushed to the branch
in the meantime, fetch, look at what Dependabot changed, and redo the fix on top rather
than overwriting it.

## 5. Wait for CI, then merge

```bash
gh pr checks <n> --watch
gh pr merge <n> --rebase --delete-branch
```

Merge only on green, one PR at a time as in step 4 of the workflow. If it is still red,
take one more look; after a second failed attempt, stop, leave the PR open with your
commits on it, and report what you tried.

If the user chose `--squash`, say before merging that the bump and the fix will become a
single commit; `--rebase` keeps them apart.

## What changes once you've pushed

Your commit makes the branch one "someone else pushed" to, and Dependabot stops rebasing
it. From then on:

- Never comment `@dependabot rebase` or `@dependabot recreate` on it. Recreate would
  discard the fix. If the branch conflicts with the base later, say so and ask what to do.
- If a newer release comes out before the PR merges, Dependabot may supersede it with a
  fresh PR that doesn't have the fix. Tell the user; the fix needs carrying over.

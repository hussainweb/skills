---
name: merge-dependabot-prs
description: Merge open Dependabot pull requests in a GitHub repository using the `gh` CLI, filtered by semver bump type and CI status. Use this skill whenever the user asks to merge, clear, batch, or clean up Dependabot PRs — "merge all dependabot PRs", "clear the dependabot backlog", "merge the dependency bumps", "land the safe dependabot updates" — or invokes it as a slash command, including when they ask to include majors, merge despite failing checks, or squash instead of rebase. Not for reviewing or merging human-authored PRs, and not for writing dependabot.yml — that is dependabot-config.
allowed-tools: Bash, Read
metadata:
  authors: "Hussain Abbas"
  version: "1.6.1"
---

# Merge Dependabot PRs

Batch-merge Dependabot's open pull requests through the `gh` CLI. A conservative default
filter lets routine dependency noise land without a human reading every diff, and leaves
anything that could break the build for a person to look at.

Run only when the user asks. Never merge PRs because you noticed some while doing something
else: merging is outward-facing and awkward to unwind.

## Defaults

Apply these unless the user says otherwise in the same request:

| Decision | Default | Why |
|---|---|---|
| Version scope | Minor and patch only | Majors carry intentional breaking changes. |
| Held-back majors | Assessed, not merged | "Skipped: major" gives the user nothing to decide with. |
| CI gate | Every check concluded successfully | Green is the only evidence a bump is safe. Pending is not passed; no checks is no evidence. |
| Workflow approvals | Never without a yes | Approving runs code with repo permissions. |
| Failing PRs | Skipped, then offered a fix | A fix pushes code to the PR; the user decides which to attempt. |
| Merge method | `--rebase` | Linear history, no merge commits for dependency churn. |
| Branch cleanup | `--delete-branch` | Dependabot branches are disposable. |
| Repository | The working directory's | `--repo OWNER/REPO` when the user names another. |
| Ordering | Clear PRs first, then rebuild-and-merge one at a time per ecosystem | Each merge moves the base; rebuilding ahead of it wastes CI. |

Common overrides:

- "include majors" / "everything" → drop the version filter; keep the CI gate.
- "only patches" → tighten the version filter.
- "even if checks are failing" / "don't wait for CI" → drop the CI gate.
- "squash them" / "use a merge commit" → `--squash` or `--merge`.
- "keep the branches" → drop `--delete-branch`.
- "just the GitHub Actions ones" / "only npm" → filter by ecosystem (dependency names and
  Dependabot's labels show it).
- "merge #42 and #47" → that explicit list, default gates still applied unless told not to.
- "just merge, don't analyse the majors" → skip step 6; list held-back majors by number and
  version only.
- "and fix the failing ones" → that is the yes for step 8 on every red PR; skip the question.

When an override loosens a safety gate (merging majors, merging with red or pending checks,
`--admin` past branch protection), say plainly what will be merged and get a yes first.
The user asking for it is the reason to offer it, not to skip confirming: these are the
merges that are expensive to discover after the fact.

## Workflow

### 1. Preflight

```bash
gh auth status
gh repo view --json nameWithOwner,defaultBranchRef,rebaseMergeAllowed,squashMergeAllowed,mergeCommitAllowed
gh pr list --author app/dependabot --state open --json baseRefName \
  --jq '[.[].baseRefName] | unique'                     # --repo as usual
```

If `gh` is missing or unauthenticated, stop and say so. If the planned merge method is
disabled, ask which allowed one to use rather than falling back silently; it changes what
lands in history.

The merges land on each PR's base branch (`BASE` below). Take it from the PRs: a
`target-branch` in `dependabot.yml` can point them away from the default branch, and some
repos have more than one.

#### The local checkout

Work out how the checkout relates to `BASE` before the remote moves. It decides what the
plan has to warn about and what step 5 can safely do. Skip this and step 5 when the working
directory isn't a checkout of the target repository; say so in the report.

```bash
git fetch origin
git status --short --branch                         # current branch, uncommitted work
git rev-parse --verify --quiet "refs/heads/$BASE"   # is there a local BASE?
git log --oneline --stat "origin/$BASE..$BASE"      # local commits not on the remote
git worktree list                                   # is BASE checked out elsewhere?
```

Check for unpushed commits on `BASE` whichever branch the user is on. Every PR's CI ran
against the remote base, and these commits will land after the batch without having been
tested with it. One that touches the same manifest or lockfile can make a PR redundant or
conflicting; one that changes code calling the dependency, or the CI config, can break a
bump that looks green. If there are any, lead the plan with an "Unpushed local commits"
heading: their subjects, flagging those that touch manifests, lockfiles, CI config or code
using a dependency in the batch. Then stop for confirmation. The better order is usually to
push first, let Dependabot rebase and CI rerun, then merge. Offer to push; don't push
unasked. If the user says merge anyway, go ahead.

Then note which of these the checkout is in:

- **On `BASE`.** Step 5 fast-forwards it. If there are uncommitted changes, note them in the
  plan: if they touch a file the batch changes, the fast-forward will refuse.
- **On another branch, or detached HEAD.** A plain `git pull` here pulls the wrong branch,
  and `git pull origin $BASE` would merge the base into the user's branch. Say in the plan
  that you'll update `BASE` in place and leave their branch alone. If their branch edits a
  manifest or lockfile the batch also bumps, mention the conflict waiting for their next
  rebase. Not a reason to stop.
- **No local `BASE`.** Nothing local to update beyond the fetch.
- **`BASE` checked out in another worktree.** It can't be updated from here; step 5 names
  the path.

### 2. Inventory and classify

Run the bundled script. It is read-only. It reads Dependabot's `updated-dependencies` commit
trailer, falls back to comparing the "Bumps X from A to B" versions when the trailer omits
`update-type` (it often does), takes the worst bump across a grouped PR's members, and
collapses the check rollup into one word.

```bash
python3 <skill-dir>/scripts/dependabot_prs.py            # current repo
python3 <skill-dir>/scripts/dependabot_prs.py --repo OWNER/REPO
python3 <skill-dir>/scripts/dependabot_prs.py --json     # machine-readable
```

Each row gives the ecosystem (from Dependabot's branch name or labels), the bump (`patch`/`minor`/`major`/`unknown`), the checks
(`pass`/`failing`/`pending`/`none`), GitHub's merge state, and whether the PR clears the
default policy, with the reason when it doesn't.

Four results need judgement:

- **`unknown` bump.** Usually a SHA-pinned GitHub Action, with no version to compare. Don't
  assume minor; skip it and list it.
- **`none` checks.** No CI ran, so there is no evidence. Skip, not merge-with-a-caveat, and
  "merge all dependabot PRs" doesn't cover these: a repo with no CI is where a bad batch
  goes unnoticed. Tell the user to name the PR numbers if they want them. When they do
  ("merge #29 and #31"), that is the deliberate instruction the gate was waiting for; merge
  with the usual defaults, no further confirmation.
- **`pass` on a stale branch.** Green proves the bump against the commit the branch was cut
  from, not today's base. If the base has moved, the suite that ran may be materially
  smaller, and a passing run's totals look complete unless you know what they should be.
  Check any PR open more than a day or two, and always a major:

  ```bash
  branch=$(gh pr view <n> --json headRefName --jq .headRefName)
  git fetch origin "$branch"
  git merge-base --is-ancestor "origin/$BASE" "origin/$branch" \
    && echo "based on current $BASE" || echo "STALE"
  git ls-tree -r --name-only "origin/$branch" | grep -cE '\.test\.[jt]sx?$'   # when stale,
  git ls-tree -r --name-only "origin/$BASE"   | grep -cE '\.test\.[jt]sx?$'   # compare
  ```

  Runners that collect tests by glob from the root are the exposed ones. A real case: a
  vitest bump whose CI reported "33 passed (33)" while the base had 51 test files, 18 of
  them landed after the branch was cut. If the counts differ, say so in the plan instead of
  quoting the green tick, and put the PR in the rebuild queue (step 4).
- **`action_required` checks.** An automated commit on the branch (formatter, lockfile
  generator, migration step) left the follow-up runs waiting for maintainer approval. The
  suite hasn't failed; it hasn't run. Follow
  [references/workflow-approvals.md](references/workflow-approvals.md): list them in the
  plan and ask before approving anything.

### 3. Report the plan

Say what you are about to merge, what you are leaving alone, and why. If the classification
is wrong, this is where it gets caught, at no cost.

Write grouped bullets under `###` headings such as "Merging", "Rebuild, then merge" and
"Leaving open", not a
Markdown table: the reader may be in a terminal or a client that renders tables badly. One
line per PR: number, dependency, version range, verdict.

Then proceed. "Merge all Dependabot PRs" authorises merging the set that survives the
filters. Stop for confirmation only when a gate was loosened, the plan is empty, the base
has unpushed local commits (step 1), or something looks off. PRs waiting on a workflow
approval don't hold up the others.

### 4. Merge, one PR at a time

Every merge moves the base, so the batch is a loop, not two phases. Never rebuild a
batch of PRs up front and merge them afterwards. A PR that is ready can't sit waiting on
the others' CI, and a merge can make the next PR in the same ecosystem stale or conflicted
again, wasting its rebuild.

**First, merge what is clear now:** green on the current base, mergeable. Go in ascending
PR number and check each result before the next:

```bash
gh pr merge <number> --rebase --delete-branch
```

**Then work the rebuild queue in lanes, one lane per ecosystem.** The queue is the stale
PRs from step 2, plus any PR an earlier merge left conflicted, behind or with restarted
checks. Group it by the script's ecosystem column. Within a lane, keep one PR in flight at
a time. Across lanes, run in parallel: an npm bump and a Composer bump touch different
manifests and lockfiles, so merging one doesn't conflict with the other, and GitHub
Actions bumps only touch workflow files. Some cases change the lanes:

- **One ecosystem, several manifests** (a monorepo with separate `package.json` and
  lockfile per app): PRs whose changed files don't overlap can be separate lanes. When
  unsure, keep them in one.
- **`unknown` ecosystem:** put all such PRs in a single lane of their own.
- **Repo requires up-to-date branches:** every merge puts every other branch behind, so
  lanes buy nothing; use a single lane. Act on this only if you already know it, for
  example from a merge that failed as out of date. Don't make a call to check.

For the PR at the head of each lane:

1. Look at it fresh. The last merge may already have set things moving: Dependabot rebases
   a conflicted PR on its own when the base moves. If its branch is already on the current
   base, or Dependabot has just pushed, skip the nudge and wait for CI.
2. Otherwise nudge it ("Rebuilding a branch", below). A PR that is merely behind, with no
   conflict, isn't rebased automatically, so it needs the nudge when the repo requires
   up-to-date branches or when its green is stale.
3. If you nudged, wait up to about ten minutes for Dependabot's new commit. If nothing
   arrives, follow up as "Rebuilding a branch" describes.

   ```bash
   old=$(gh pr view <n> --json headRefOid --jq .headRefOid)    # before the nudge
   for i in $(seq 20); do
     [ "$(gh pr view <n> --json headRefOid --jq .headRefOid)" != "$old" ] && break
     sleep 30
   done
   ```

   Then wait for CI on the new commit:

   ```bash
   gh pr checks <n> --watch
   ```

   With several lanes in flight, CI runs concurrently on GitHub, so watching their PRs in
   turn costs little. Nudge every lane's head first, then watch.
4. Green: merge it and move that lane on to its next PR. Red, or stuck: leave it, note why,
   and move that lane on. Merges still go one at a time, whichever lane they come from.

Collect failures rather than stopping the batch:

| Failure | Meaning | Action |
|---|---|---|
| `the merge commit cannot be created` / conflicts | Drift from an earlier merge in this batch | Into the rebuild queue |
| Base branch out of date (protection) | Repo requires up-to-date branches | Into the rebuild queue |
| `Pull request is not mergeable` while the API says `CLEAN` | GitHub's cached mergeability is stale | Retry once; if it fails the same way, queue it |
| `Pull request is not mergeable` with pending checks | CI restarted after a base change | Into the queue; wait for CI, no nudge |
| `action_required` | A pipeline commit's run is waiting for approval | [references/workflow-approvals.md](references/workflow-approvals.md) |
| Review required | Protection wants an approval | Report; never self-approve or use `--admin` unasked |

#### Rebuilding a branch

Nudge a branch only when the automatic rebase isn't coming or isn't enough (step 4
says when), and only for the PR at the head of its lane. Act; don't leave the user a
command to type. Who has committed to the branch decides what you send:

```bash
gh pr view <n> --json commits --jq '[.commits[].authors[] | {login, email}] | unique'
```

- **Only Dependabot:** comment `@dependabot rebase`. This isn't a git rebase. It runs the
  same refresh job as `recreate`, regenerating the update and lockfile against today's base
  and picking up any newer release, so age alone is no reason to recreate. Dependabot also
  acts on `rebase` more reliably.
- **Dependabot plus automation** (a login or email ending in `[bot]`, or a workflow the user
  says commits to these branches): comment `@dependabot recreate`. Dependabot won't rebase a
  branch someone else has pushed to. Recreate discards the extra commits, which is fine:
  the workflow reruns on the rebuilt branch and redoes them, and its run will likely land
  in `action_required`.
- **A person as well:** send nothing. Their commit may be a fix the bump needed, and
  recreate would discard it. Name the PR and the authors and ask what to do.

```bash
gh pr comment <n> --body "@dependabot rebase"     # or recreate
```

No confirmation is needed for either comment. If Dependabot answers a `rebase` by saying the
branch was edited, or nothing happens within a few minutes, recheck the authors: all bots
means follow up with `recreate`, otherwise ask. If a recreate also goes unanswered, leave
the PR for another pass and move on.

Never rebase a Dependabot branch by hand: that is exactly the "someone else pushed" state
that stops Dependabot's own rebases. Never close a Dependabot PR unless asked: closing tells
Dependabot to stop offering that update.

### 5. Bring the local checkout up to date

Once the batch is done (not after each merge), the local `BASE` is behind by everything that
merged. Left that way, the user's next commit starts from a base without the bumps, and step
6 would read pre-merge code. Act on the state step 1 found, after `git fetch origin`:

- **On `BASE`:** `git pull --ff-only`
- **On another branch, or detached:** `git fetch origin "$BASE:$BASE"`. This fast-forwards
  `BASE` in place without touching the checkout. Remind the user their branch doesn't
  have the bumps yet; rebasing or merging it is theirs to do.
- **No local `BASE`:** the fetch was all there was to do.
- **`BASE` in another worktree:** leave it; name the path so the user can pull there.

Fast-forward only. If it refuses (local commits on `BASE`, or uncommitted changes in the way),
stop and report. Don't stash, rebase, merge or reset past it: that is the user's work.

### 6. Assess the held-back majors

Do this after the merges, so nothing delays the bumps cleared to land. For each major, and
each grouped PR whose worst member is a major, judge the risk for this project and give a
verdict of Low risk, Needs work first, or Can't tell. Follow
[references/assessing-majors.md](references/assessing-majors.md) for the evidence to gather
and how to write it up. When the plan is empty, deliver the plan and the assessments in one
reply; the read-out is the only useful thing that run produces. Skip only when the user
asked.

### 7. Report the outcome

Same grouped-bullet form as the plan:

- **Merged:** PR numbers, dependency and version range.
- **Rebuilt and merged:** which PRs went through the queue, and whether you posted `rebase`
  or `recreate` on them.
- **Needs another pass:** queue PRs that didn't make it, each with why: red after the
  rebuild, Dependabot never responded, or it waits on the user because a recreate would
  discard a person's commits.
- **Awaiting approval:** PRs with paused workflow runs, the triggering commit, and what is
  needed.
- **Held back:** the majors with their assessments, security-labelled ones first and marked.
- **Skipped:** everything else held (failing checks, no CI, unknown version, protection),
  grouped. For no-CI PRs, say they merge when the user names the numbers.
- **Failed:** anything that errored, with the error.
- **Local checkout:** which branch you updated and how many commits came in, or why not
  (different repo, no local base, another worktree, or what blocked the fast-forward). When
  the user is on another branch, say it doesn't have the bumps yet.

Call out held-back or skipped security updates (Dependabot labels them `security`). A
skipped security fix on a major is the one leftover that wants attention rather than a
re-run tomorrow.

### 8. Offer to fix the failing PRs

If any PR was left open because its checks are red (skipped at the start, or red after a
rebuild), end the report by asking whether to attempt fixes. Name each PR with a line on
what failed, from the failing job's log (`gh run view <run-id> --log-failed`), so the user
can pick:

> #61 eslint 9.18 → 9.19: `no-unused-vars` now flags two catch bindings in `src/api.ts`.
> #64 vitest 2.1 → 3.0: config rejects `test.coverage.all`.
> Shall I try fixing these? I'd commit each fix on its PR branch and merge once CI is
> green.

Don't fix anything without a yes; the user may want some of them left. On a yes, follow
[references/fixing-failing-prs.md](references/fixing-failing-prs.md). The fix goes on the PR
branch, never on the base, so the bump and what it needed land together and stay reviewable
as one PR. Work the chosen PRs one at a time, then report them in the same form: fixed and
merged, or still open with what you tried.

Skip the question when there are no red PRs, and when the user already said to fix them
(see overrides). PRs held for other reasons (majors, no CI, `unknown` bumps) aren't
failing; don't offer to fix those.

## Notes on the moving parts

**Author filter.** Dependabot PRs are authored by `app/dependabot`. Pass `--author` for the
legacy `dependabot-preview` or a mirror bot.

**Pre-1.0 versions.** `0.5.6 → 0.6.0` is a minor by the letter of semver, but pre-1.0
projects routinely break in that slot. The script flags these; carry the flag into the
report.

**Release notes come from the PR body.** The inventory ignores the collapsed `<details>`
blocks; `--notes` is built on them. Some ecosystems never get notes (`@types/*`) and some
upstreams only link a blog post, so empty notes mean "look upstream", not "nothing changed".

**Grouped updates** are classified by their worst member. The PR is atomic, so its risk is
the maximum risk in it.

**`mergeStateStatus` needs the `repo` token scope.** Without it the script retries without
that field and says so, and protection failures surface only at merge time.

**Mergeability is computed lazily.** A fresh PR can report `UNKNOWN`; re-run the script.

**Commit data comes from a separate GraphQL query.** Don't add `commits` to the script's
`gh pr list` query: GitHub rejects it above ~48 PRs. The script's module docstring explains
why. If a PR's commits can't be fetched, it falls back to the body, is likelier to come out
`unknown`, and the script notes it.

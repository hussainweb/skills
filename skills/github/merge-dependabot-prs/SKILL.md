---
name: merge-dependabot-prs
description: Merge open Dependabot pull requests in a GitHub repository using the `gh` CLI, filtered by semver bump type and CI status. Use this skill whenever the user explicitly asks to merge, clear, batch, or clean up Dependabot PRs — "merge all dependabot PRs", "clear the dependabot backlog", "merge the dependency bumps", "land the safe dependabot updates" — or invokes it as a slash command. Defaults to minor and patch bumps whose checks are all green, merged with rebase and branch deletion, and honours overrides such as including majors, merging despite failing checks, squash/merge-commit, or keeping branches. Not for reviewing or merging human-authored PRs.
allowed-tools: Bash, Read
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Merge Dependabot PRs

Batch-merge Dependabot's open pull requests through the `gh` CLI, applying a conservative
default filter so routine dependency noise lands without a human reading every diff, while
anything that could actually break the build stays put for a person to look at.

This skill only runs when the user asks for it. Never merge PRs opportunistically because
you noticed some open ones while doing something else — merging is outward-facing and
awkward to unwind, so it should always be a thing the user asked for.

## Defaults

Apply these unless the user says otherwise in the same request:

| Decision | Default | Why |
|---|---|---|
| Version scope | Minor and patch bumps only | Major bumps carry intentional breaking changes and deserve a human. |
| CI gate | Every check must have concluded successfully | A green build is the only evidence the bump is safe. Pending counts as not-yet-passed, and no checks at all counts as no evidence. |
| Merge method | `--rebase` | Keeps history linear; no merge commits for dependency churn. |
| Branch cleanup | `--delete-branch` | Dependabot branches are disposable and pile up fast. |
| Repository | The one in the working directory | Pass `--repo OWNER/REPO` when the user names a different one. |
| Ordering | One at a time, oldest PR number first | Each merge moves the base branch; serialising keeps the failure mode legible. |

The user's phrasing overrides any of these. Common overrides and what they mean:

- "include majors" / "everything" → drop the version filter; still respect the CI gate.
- "only patches" → tighten the version filter.
- "even if checks are failing" / "don't wait for CI" → drop the CI gate (see the caution below).
- "squash them" / "use a merge commit" → `--squash` or `--merge` instead of `--rebase`.
- "keep the branches" → drop `--delete-branch`.
- "just the GitHub Actions ones" / "only npm" → filter by ecosystem, visible in the
  dependency names and Dependabot's labels.
- "merge #42 and #47" → operate on that explicit list, still applying the default gates
  unless told not to.

When an override loosens a safety gate — merging majors, merging with red or pending
checks, using `--admin` to bypass branch protection — say plainly what will be merged and
get a yes before doing it. The user asking for the loosened behaviour is the reason to
offer it, not a reason to skip the confirmation, because these are exactly the merges that
are expensive to discover after the fact.

## Workflow

### 1. Preflight

```bash
gh auth status
```

If `gh` is missing or unauthenticated, stop and say so — everything downstream needs it.

Then confirm the repository allows the merge method you plan to use:

```bash
gh repo view --json nameWithOwner,rebaseMergeAllowed,squashMergeAllowed,mergeCommitAllowed
```

If rebase merging is disabled, don't silently fall back to another method — the merge
strategy changes what lands in history, so ask which of the allowed methods to use.

### 2. Inventory and classify

Run the bundled script. It is read-only and does the fiddly parts consistently: reads
Dependabot's `updated-dependencies` commit trailer, falls back to comparing the versions in
"Bumps X from A to B" when the trailer omits `update-type` (it often does), takes the worst
bump across all members of a grouped PR, and collapses the check rollup into one word.

```bash
python3 <skill-dir>/scripts/dependabot_prs.py            # current repo
python3 <skill-dir>/scripts/dependabot_prs.py --repo OWNER/REPO
python3 <skill-dir>/scripts/dependabot_prs.py --json     # same data, machine-readable
```

Each row reports the bump type (`patch`/`minor`/`major`/`unknown`), check state
(`pass`/`failing`/`pending`/`none`), GitHub's merge state, and whether the PR clears the
default policy. Anything the default policy would skip comes with the reason attached.

Two classifications need judgement rather than blind application:

- **`unknown` bump** — usually a SHA-pinned GitHub Action, where there is no version to
  compare. It is not safe to assume minor. Skip it by default and list it for the user.
- **`none` checks** — the repo has no CI on that PR, so there is no evidence the bump is
  safe. An absent gate is not a passed one, so this is a skip, not a merge-with-a-caveat.
  Report these PRs and tell the user to name specific PR numbers if they want them merged
  anyway. Do not offer to merge the batch, and do not treat "merge all dependabot PRs" as
  covering them — a repo with no CI is exactly where a bad batch merge goes unnoticed.

  When a request that names specific numbers comes back ("merge #29 and #31"), that is the
  deliberate instruction this gate was waiting for: merge them with the usual defaults,
  no further confirmation needed.

### 3. Report the plan before touching anything

State, in one or two lines, exactly what you are about to merge and what you are leaving
alone and why. This is what makes a batch merge reviewable: if the classification is wrong,
this is the moment it gets caught, and it costs nothing.

Write it as grouped bullets under real Markdown headings (`###`), not a Markdown table. The
script's table is for you; the reply goes to a person who may be reading it in a terminal or
a client that renders tables badly, and a mangled table is worse than a plain list. Headings
rather than bold labels, because they give the reader something to navigate by. One line per
PR — number, dependency, the version range, and the verdict — under short headings like
"Merging" and "Leaving open".

Then proceed — an explicit "merge all Dependabot PRs" is authorisation to merge the set
that survives the filters. Stop for confirmation only when a gate was loosened (above), the
plan is empty, or something looks off.

### 4. Merge, one at a time

```bash
gh pr merge <number> --rebase --delete-branch
```

Add `--repo OWNER/REPO` when working outside the current directory. Merge in ascending PR
number, checking each result before starting the next.

Serialising matters here. Each merge advances the base branch, so later PRs can become
`BEHIND` or start conflicting mid-batch — especially on repos whose branch protection
requires branches to be up to date, where only the first merge in a batch will succeed.
That is expected, not a failure of the plan.

When a merge fails partway through the batch, keep going with the rest and collect the
failures. Common ones:

| Failure | What it means | What to do |
|---|---|---|
| `not mergeable: the merge commit cannot be created` / conflicts | The branch drifted, usually from an earlier merge in this batch | Report it and move on — see below before commenting anything |
| Base branch out of date (branch protection) | Repo requires up-to-date branches | Same: report and move on |
| `Pull request is not mergeable` on a PR the API still reports as `CLEAN` | GitHub's cached mergeability is stale — an earlier merge in this batch moved the base and the PR hasn't been re-evaluated yet | Retry once; if it fails identically, treat it as drift |
| `Pull request is not mergeable` with pending checks | CI restarted after a base change | Offer auto-merge instead of waiting: `gh pr merge <n> --rebase --delete-branch --auto` |
| Review required | Branch protection wants an approval | Report it; do not self-approve or use `--admin` without being asked |

### Don't reach for `@dependabot rebase` by reflex

Dependabot rebases its own open PRs when the base branch moves — that is the default
`rebase-strategy`. So for the ordinary mid-batch conflict, the right move is to report the
PR as needing another pass and stop there. Commenting adds noise and buys nothing, because
the rebase was already coming.

Comment `@dependabot rebase` only when there is a reason to think the automatic pass is not
coming: a PR that has been sitting long enough to have gone stale, or one that is still
conflicted well after an earlier merge should have triggered a rebase.

Before deciding between those, look at who has committed to the branch — it is the fact that
separates "leave it alone" from "nudge it" from "this needs the user":

```bash
gh pr view <n> --json commits --jq '[.commits[].authors[].login] | unique'
```

There is a case where rebase is the wrong instruction entirely. If anything other than
Dependabot has pushed to the branch — most often a workflow step that commits back to the
PR, like a lockfile regenerator or a formatter — Dependabot stops rebasing it, precisely so
it doesn't clobber that work. Commenting `@dependabot rebase` there does nothing at all.
What that PR needs is `@dependabot recreate`, which rebuilds it from scratch.

That is a heavier action, because recreating discards whatever those extra commits added, so
it is the user's call rather than yours. When the author list contains anything other than
Dependabot, say so and ask — don't quietly recreate, and don't leave the user thinking a
rebase comment is going to fix it.

Never rebase a Dependabot branch by hand. Dependabot owns these branches and hand-rebasing
puts you in exactly the "someone else pushed to it" state described above, which stops the
automatic rebases you were trying to help along.

Never close a Dependabot PR to "clean up" unless the user asked for that. A closed PR tells
Dependabot to stop offering that update, which is a decision with a long tail.

### 5. Report the outcome

Finish with a short factual summary, in the same plain grouped-bullet form as the plan:

- Merged: PR numbers with the dependency and version range.
- Needs another pass: PRs that hit conflicts. Say whether Dependabot will rebase them on its
  own (the usual case, so nothing is owed from the user but patience) or whether they are
  waiting on a decision from them, such as a branch that needs recreating.
- Skipped: PRs with the reason (major bump, failing checks, no checks configured,
  unverifiable version, blocked by protection), grouped so the user can decide what to do
  about them. For the no-CI ones, spell out the way forward — they merge when the user
  names the PR numbers.
- Failed: anything that errored, with the error.

Call out security updates that were skipped. Dependabot labels them `security`, and a
skipped security fix on a major bump is the one item in the leftovers that genuinely wants
attention rather than a re-run tomorrow.

## Notes on the moving parts

**Author filter.** Dependabot PRs are authored by `app/dependabot`. The script defaults to
that; pass `--author` if a repo uses the legacy `dependabot-preview` or a mirror bot.

**Pre-1.0 versions.** `0.5.6 → 0.6.0` is a minor bump by the letter of semver, and both
Dependabot and this script classify it that way, but pre-1.0 projects routinely ship
breaking changes in that slot. The script flags these; pass the flag along in your report
rather than burying it.

**Grouped updates.** A grouped PR ("Bump the npm-dependencies group with 5 updates") is
classified by its worst member, so one major in the group holds back the whole PR. That is
the correct read — the PR is atomic, so the risk is the maximum risk in it.

**`mergeStateStatus` needs the `repo` token scope.** Without it the script retries without
that field and says so; branch-protection state simply won't be visible, so expect merge
attempts to surface protection failures that the plan could not predict.

**Mergeability is computed lazily.** A fresh PR can report `UNKNOWN`; re-running the script
resolves it.

**Commit metadata comes from a hand-written GraphQL query.** Dependabot's commit trailer
(`update-type: version-update:semver-minor`) is the only place the bump type is stated
outright, so the script has to read the commits — but asking `gh pr list` for `commits`
alongside the other fields makes GitHub reject the query outright. gh expands that field to
100 authors on each of 100 commits per PR, which exceeds the 500,000-node ceiling on any
`--limit` above ~48, whether or not that many PRs exist.

So the script lists PRs without `commits` and then runs one `gh api graphql` call asking for
the commit messages alone, with an aliased `pullRequest(number:)` per PR. Measured cost for
a full 100-PR batch: 500 nodes (0.1% of the ceiling) and 1 rate-limit point. Don't add
`commits` back to the list query, and if you extend the GraphQL query, keep nested
connections out of it — that multiplication is what broke it the first time.

If a PR's commits can't be fetched, that PR falls back to its body: the versions are still
there, the `update-type` trailer is not, so it is likelier to land as `unknown` and be held
back. The script says so in that PR's notes. One unreadable PR doesn't cost the batch — GitHub
returns the rest alongside the error, and the script keeps whatever resolved.

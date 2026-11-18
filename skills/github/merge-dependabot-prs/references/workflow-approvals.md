# Approving workflow runs paused by pipeline commits

When a workflow step (a formatter, lockfile generator, or a migration such as
`biome migrate`) commits back to a PR branch, GitHub holds the workflow runs that commit
triggers. They show `conclusion: action_required` with 0s elapsed. The suite hasn't failed;
it hasn't run.

Approving a run executes code with repository permissions on Actions runners, so never
approve one without an explicit yes from the user.

## Find the paused runs and what triggered them

```bash
gh run list --commit <headSha> --json databaseId,workflowName,status,conclusion
gh run list --json databaseId,workflowName,conclusion \
  --jq '.[] | select(.conclusion=="action_required")'        # across the repo
gh pr view <n> --json commits \
  --jq '.commits[-1] | {author: .authors[0].login, message: .messageHeadline}'
```

## Ask, then approve

List these PRs in the plan under an "Awaiting workflow approval" heading, each with the
dependency, the triggering commit (e.g. `github-actions[bot]` committing
`chore: run biome:migrate`) and the waiting workflows (e.g. `CI`). Then ask, naming all of
that:

> PR #54 has a CI run awaiting approval, triggered by `chore: run biome:migrate` from
> `github-actions[bot]`. Shall I approve it?

Once the user says yes:

```bash
gh api -X POST /repos/:owner/:repo/actions/runs/<run-id>/approve
gh run watch <run-id>
```

If the run goes green, the PR clears the CI gate and merges through the normal workflow.

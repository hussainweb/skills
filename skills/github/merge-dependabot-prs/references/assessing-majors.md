# Assessing held-back majors

For every PR the version filter held back (each major, and any grouped PR whose worst
member is a major), work out how risky the upgrade is *for this project*. The assessment is
information for the user and never turns into a merge: a major you judge low-risk still
waits for the user to name it.

## Gather the evidence

Check staleness first (SKILL.md, step 2). On a major that has sat for a while, the green
tick is least trustworthy and carries the most weight. If the branch is stale, have
Dependabot rebuild it (see "Rebuilding a branch" in SKILL.md) and read CI on the rebuilt
branch before writing the assessment. Otherwise you are grading the upgrade on a suite that
no longer matches the project.

Then run the bundled script, which collects what Dependabot attached to the PR:

```bash
python3 <skill-dir>/scripts/dependabot_prs.py --notes 42 45        # --repo as usual
```

For each PR it prints the version range, the upstream repository, the files the PR touches,
the check state, the release notes and changelog as plain text, and the lines in them that
mention breaking changes, removals or new runtime minimums. Read the notes, not just the
flagged lines: the flags are a reading aid, and a release that only links to a blog post
produces none. When the body has no notes, the script says so and points at `gh release`
for the upstream repo.

## Work out what it means here

The questions, in the order they usually settle things:

- **Did CI pass on the PR?** Dependabot's branch ran the project's checks against the new
  major, so green is the strongest single piece of evidence. Say what CI covers: a repo
  whose only check is a linter has proven nothing about runtime behaviour. Red is just as
  informative, because the failing job's log usually names the exact break, which turns
  "major bump" into "needs X changed". Logs are long, so filter:

  ```bash
  gh pr checks <n>                                    # names, states, run links
  gh run view --job <job-id> --log-failed | grep -iE -B3 'error|fail|cannot|not found' | head -60
  ```

- **What kind of dependency is it?** A dev tool (linter, test runner, bundler) breaks the
  build, not production. A type package tracks its runtime's major rather than carrying
  changes of its own. A GitHub Action's majors are almost always a runtime bump or renamed
  inputs. A framework, or a library the code calls directly, is where the real work is.
  The manifest section and the PR's changed files tell you which; a lockfile-only PR is a
  transitive dependency the project never imports by name.
- **Does this project touch what changed?** Take the removals and renames from the notes
  and grep for them: imports and call sites for a library, `uses:` lines and inputs for an
  Action, the config file for a tool. If nothing uses the removed surface, the major is a
  major for someone else.
- **Does the new version's floor fit?** A new minimum Node, PHP, Python or framework
  version is the commonest hidden break. Compare it with what the project declares:
  `engines`, `require.php`, `python_requires`, `.nvmrc`, `runs.using`, the CI matrix.
- **How far is the jump?** Two majors at once (5 → 7) means two sets of breaking changes,
  and the notes Dependabot pastes usually cover only one of them.

Read the merged base, not whatever the working tree holds. When the user is on another
branch, use `git grep <term> "origin/$BASE"` and `git show "origin/$BASE:<path>"`. When the
repo isn't checked out at all, `gh search code --repo OWNER/REPO "<term>"` and
`gh api repos/OWNER/REPO/contents/<path>` stand in, and the report should say when that
limited what you could verify.

Anything public and read-only is fair game: the upstream release page or announcement,
`npm view` / `composer show` / `pip index` for peer and engine constraints. Trying the bump
(installing it and running the build and tests) is allowed only in a throwaway copy, never
in the user's checkout, and only when reading can't settle the question. Say so when a
verdict rests on a trial run.

## Write it up

One bullet per PR under the report's "Held back" heading: PR number, dependency, version
range, the verdict, then three to five sentences. Cover what actually breaks in the new
major, whether this project is exposed to it and how you know (name the file or config
key), and what would have to happen for the PR to merge ("say `merge #45`", "migrate the
config first", "wait for upstream X"). Every sentence should carry evidence or a decision.
Don't restate the changelog; the user can read that on the PR. What they can't get from the
PR is the link between the changelog and their code.

Use one of three verdicts so the list scans:

- **Low risk**: the breaking changes don't touch this project, and you can point at the
  evidence.
- **Needs work first**: something in this repo has to change first, and you can name it.
- **Can't tell**: the notes are missing, or the usage is too dynamic for grep to settle.
  Say what would settle it.

Reach for "Can't tell" whenever it is the truth. A confident "low risk" that turns out
wrong costs the user more than an honest gap, and it is the one thing that would make them
stop trusting the report.

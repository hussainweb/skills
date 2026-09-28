# Implementation agent prompt template

Every agent starts cold. It cannot see the orchestrator's conversation, the user's answers,
or what other agents are doing, so the prompt has to carry all of it. Fill in the
placeholders, cut sections that don't apply (no deploy, no parallel agents), and keep the
rest. A prompt that relies on "as discussed" produces an agent that guesses.

The sections below are in the order the agent needs them.

---

## 1. Task

> You are implementing bead(s) `<id>` [then `<id>`, `<id>` in that order] in `<repo path>`.
> `<one or two sentences on what they achieve and why>`.

## 2. Load context before touching code

> 1. Run `bd prime` and read all of it. If the output is saved to a file, read the file.
> 2. Read `AGENTS.md` (and `CLAUDE.md`) at the repo root and follow them.
> 3. `bd show <id>` for each bead you own, and for the decision beads `<ids>`. Read the notes;
>    they hold decisions and hand-offs from earlier work.
> 4. `bd update <id> --claim` for each bead as you start it, not all at once.

## 3. Binding decisions

List every decision that governs this work, with the bead it is recorded on, so the agent
does not re-open it:

> These are decided. Do not revisit them; if one turns out unworkable, stop and report
> rather than choosing differently.
> - `<decision>` (recorded on `<bead>`, decided by `<user>` on `<date>`)
> - `<decision>` (orchestrator's recommendation, not yet confirmed by the user — flag if you
>   find a reason it is wrong)

## 4. Boundaries

> Other agents are working concurrently. Stay out of their areas:
> - `<agent/bead>` owns `<paths or area>` (e.g. the auth package, database migrations, the lockfile)
>
> If you find you need to change something in those areas, stop and report instead.
>
> Do not fan out into your own checkout. If you delegate to sub-agents, give each its own
> worktree, or run them one at a time. Parallel writers in one working tree leave a
> half-written shared state when anything interrupts them.

## 5. Workspace setup (parallel agents in worktrees)

> You are in an isolated git worktree. It may have been created from unpushed local commits,
> so first:
>
> ```bash
> git fetch origin && git reset --hard origin/main
> <fresh dependency install, e.g. npm ci>
> ```

Use the remote base only when it is current. With no remote, or with unpushed work on
`main`, have the agent create its worktree from local `main` instead:

> ```bash
> git -C <repo> worktree add ../<repo>-wt/<name> -b <branch> main
> cd ../<repo>-wt/<name>
> <give the dev environment a unique, uncommitted name, e.g. printf 'name: <project>-<name>\n' > .ddev/config.local.yaml>
> <fresh dependency install and site/app setup>
> ```
>
> Never run commands that modify the main checkout; another agent may be working there.
> If the beads live in another repo, run bd as `BEADS_DIR=<beads repo>/.beads bd ...`.
> Before reporting, rebase onto `main` if it moved, rerun the gates, and stop your dev
> environment.

## 6. Quality gates and commits

> - Before every commit run `<the repo's gates, e.g. npm run lint && npm run typecheck && npm test>`.
>   Don't commit on a red gate.
> - Commit atomically, one logical change per commit, as Conventional Commits. Commit each
>   verified piece as soon as it passes; don't hold a large uncommitted change. Sessions can
>   be cut off without warning, and committed work survives them.
> - `<user's attribution rule, e.g. "Never add Co-Authored-By or any AI attribution.">`
> - If commit signing fails or hangs, `<user's rule, e.g. "commit unsigned with
>   git -c commit.gpgsign=false commit and list those commits in your report">`.
> - Never rewrite pushed history. If you had to rewrite any history, say so at the top of
>   your report.

## 7. Push and deploy (only if the user authorised it)

Include this section only when the user said pushing or deploying is fine. Otherwise:
"Do not push. Report the branch and commits."

> - Push to `<branch>`. Follow CI to the end (`gh run watch` or equivalent); a push is not
>   done until CI is green.
> - After the deploy, verify the live system with what you can check: `<health URL, a curl
>   against an endpoint, logs>`. Say what you could not check.
> - If a deploy doesn't recover, revert immediately (`git revert`, push), confirm health, and
>   report.

State preconditions for risky pushes explicitly, with the fallback:

> Precondition: `<e.g. the permission gate must not reach main before <user> holds the admin
> role in production>`. If you cannot confirm it, push to a branch `<name>` instead and report.

## 8. Hand-offs and follow-ups

> - Leave a hand-off note on the **next** bead(s) `<ids>` with what they need from you:
>   exact function names, file paths, invariants, anything surprising.
>   Example: `bd note <next> "can(user, action) lives in packages/shared/src/roles/permissions.ts; it is pure and must stay free of DB imports so the client bundle can use it."`
> - File anything out of scope as a new bead (`bd create ... --deps discovered-from:<id>`)
>   rather than doing it.
> - Use `bd remember` only for facts every future session needs (a convention, a trap), not
>   for progress.
> - Close each bead when its acceptance criteria are met: `bd close <id> --reason "<what shipped, commits>"`.
>   If a criterion is unmet, leave it open with a note saying which.

## 9. Report

> When done, reply with the report in this format: `<paste the format from agent-report.md>`.

---

## Example (condensed)

> You are implementing `app-41` then `app-42` in `~/work/app`. Together they move permission
> checks into a shared package so the portal and the site runtime use one catalog.
>
> Load context: run `bd prime` and read all of it; read AGENTS.md; `bd show app-41 app-42
> app-38` (app-38 holds the decisions). Claim each bead as you start it.
>
> Decided (app-38, by hw, 2026-09-26): roles are defined in code; the DB stores the role ID
> as plain text with no foreign key. Don't reintroduce the roles table.
>
> Another agent owns `apps/portal/src/routes/` — stay out. You own `packages/shared` and
> `packages/db`, including the only migration this session.
>
> Worktree: `git fetch origin && git reset --hard origin/main && npm ci` first.
>
> Gates before each commit: `npm run check && npm test`. Conventional Commits, no AI
> attribution. If signing fails, commit unsigned and list those commits.
>
> Push to main is authorised. Watch CI to green; then `curl -fsS https://app.example/health`.
> If the deploy doesn't recover, revert and report.
>
> Leave a hand-off on `app-43` with the exported names and paths. File follow-ups as beads.
> Close each bead with a reason. Report in the format below.

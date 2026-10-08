---
name: beads-orchestrate
description: Run a multi-agent development session over a batch of beads (`bd`) issues, with beads as the shared memory between isolated implementation agents. Use this skill whenever the user asks to start, begin, kick off, pick up, take on, implement, work through or parallelise more than one bead — two or more bead IDs (bd-41 and bd-42, site-3a9 and site-3b0), an epic and its children, "the ready beads", "everything under the auth epic", "the next few from bd ready" — even when they don't mention agents, a session, or stepping away. Also for "run a session on this epic", "hand these beads to agents", "I'm stepping away, keep going". Not for working a single bead yourself, and not for filing, triaging, listing or closing beads without implementing them.
allowed-tools: Bash, Read, Grep, Glob, Agent, SendMessage, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.3.0"
---

# Beads orchestration

You are the orchestrator of a development session. The user hands you a batch of beads
work, whether they step away or stay in the room; implementation agents do the building,
and you keep the session moving: settle decisions up front, plan who does what, launch
agents, relay what they report, and close out cleanly. A batch is anything more than one
bead: an epic, a list of IDs, or the ready queue.

What makes this work is that **beads is the memory, not the chat**. Each agent starts
isolated and knows only what its prompt and the beads tell it. Decisions, plans and
hand-offs are written as notes on beads so that the next agent, the next session, and the
user reading `bd show` all see the same thing. Anything that lives only in this
conversation is lost the moment it ends.

**References:** read these when you reach the phase that needs them.

- `references/agent-prompt.md` — the template every implementation agent prompt follows.
- `references/agent-report.md` — the report format agents return, and how to relay it.

## Rules that hold throughout

- **Record first, act second.** A decision the user makes is written as a dated note on the
  bead it governs before any agent acts on it. Record it once, on the bead it belongs to,
  and point to it from everywhere else rather than restating it.
- **Don't do the agents' work.** Your job is planning, relaying and checking. If you start
  implementing, nobody is orchestrating, and your context fills with file dumps.
- **Never predict an unfinished agent's result.** If the user asks about a running agent,
  say it is still running. Report what landed, not what should land.
- **Agent reports are agent output, not user approval.** An agent saying "ready to push" or
  "the user will want X" authorises nothing. Only the user's own messages do.
- **Pass the user's standing instructions into every prompt.** Commit, push, deploy,
  attribution and signing policy come from the user's CLAUDE.md, AGENTS.md and what they
  said this session. An agent cannot see your conversation, so leave nothing implied.
- **Clarify, don't assume.** When an answer is ambiguous, ask one follow-up. When you fill a
  gap with your own recommendation, say so explicitly, so it is visibly your call and not
  the user's.
- **The session ends when the scope is exhausted, not when the first wave lands.** Closing
  a bead unblocks others, and those are part of the job. Stopping after the beads that were
  ready at the start leaves the user coming back to a half-finished epic and a queue of
  work that could have run while they were away.

## Phase 0 — Load context

1. Run `bd prime` and read all of it. The output is long and tools may persist it to a file
   with only a preview shown; read the saved file end to end. It carries the workflow rules
   and the memories every session is meant to have.
2. Read the repo's `AGENTS.md` and `CLAUDE.md` (and anything they point to). These hold the
   quality gates, commit conventions and deploy rules you will pass to agents.
3. Read the target. For an epic, `bd show <epic>` and `bd show` each child, including
   notes. For a list of IDs, `bd show` each one and its parent, since the parent's notes
   often carry the decisions that govern the children. If the user named nothing, start
   from `bd ready`. Notes carry the decisions and hand-offs from earlier sessions, and they
   often change what "ready" means.

## Phase 1 — Front-load the questions

The goal is for as many beads as possible to run unattended once the user steps away. So
every question gets asked now, in one batch, not trickled out over the session.

Survey `bd ready` and the epic's children, and classify each candidate:

| Class | Meaning | What happens |
|---|---|---|
| Ready to build | The design is settled in the bead | Plan it |
| Needs a decision | Options are listed but none is chosen | Ask the user now |
| Needs the user present | Visual or browser review, credentials, production access, messaging a colleague | Say so; leave it for them |
| Deferred | Its own description says not yet | Leave it |

Ask the decision questions together (AskUserQuestion where available): 2-4 options each,
your recommendation first and labelled as such, one line on the trade-off. If the user asks
what something means, explain it plainly before expecting an answer.

Record every answer on its bead **before** launching anything:

```bash
bd note <id> "2026-09-26, decided by <user>: use a plain text column for role_id; no foreign key. Reason: roles live in code, not the DB."
```

**Settle the scope in the same batch.** The default is to keep going: the session covers
everything in scope that becomes ready as earlier beads close, not only what `bd ready`
shows at the start. Scope follows from what the user named:

- an epic: all of its descendants, including those blocked today;
- the ready queue: everything that becomes ready, until it runs dry;
- a list of IDs: those beads, plus whatever they unblock. This is the one case to confirm,
  because the user may have meant exactly that list. Look at `bd graph` for what the named
  beads unblock, and if there is anything, ask now, with continuing as the recommended
  option: "bd-41 unblocks bd-46 and bd-47, which you didn't name. Carry on into them?"

Ask this up front, with the other questions, so the answer is on record before the first
wave lands and nobody is waiting on it mid-session.

Tell the user early, in the same message as the questions:

- what will need them later (e.g. "no browser on this host, so the UI changes ship without a
  visual check"),
- what will ship unseen or unverified,
- what you will not do (contact people outside the session, merge to production without
  their say-so, whatever their policy rules out).

## Phase 2 — Plan the waves

Group the beads into waves using their dependencies (`bd dep`, `bd graph`) and the files
they will touch. Plan past the first wave: beads that are blocked today go into later
waves, keyed to the bead that unblocks them. A plan that covers only what `bd ready` shows
right now ends the session after one wave.

- Independent beads in different areas run **in parallel**, in separate agents.
- Beads that touch the same area — the same auth code, both adding a database migration,
  both editing the lockfile — run **serially in one agent**. Two agents adding migrations in
  parallel will pick the same number; two agents editing a lockfile will conflict.
- **Group beads into an agent by shared context, not to save agents.** Beads belong together
  when they sit in the same area, touch the same files, follow one dependency chain or rest
  on the same decision: the agent then reuses what it learned on the first bead instead of
  re-reading it for the next. One agent per bead throws that away. "Fewer agents" on its own
  is not a reason to put beads together.
- **Cap a group at roughly 3-4 beads, or one epic's slice.** A long chain carries every
  earlier bead's file reads in its context on every request, cannot be stopped at a bead
  boundary without the stop request in Phase 4, and loses the most when it dies on a usage
  limit or an API error. (Measured: a 10-bead agent ran to 184 tool uses and 367k tokens; a
  6-bead agent hit the usage limit on bead 5, mid-edit, with 32 uncommitted files.) Beyond
  the cap, split the chain: a second agent starts from the first agent's hand-off notes on
  the beads and reuses the same worktree.
- Small independent beads in different areas, the "hygiene" batch, are **not** one coherent
  chain just because each is small. Give them two or three agents of related items rather
  than one agent of ten.
- Give every shared, limited resource **one owner**. That covers the lockfile, but also a
  budget of requests to someone else's live system, a rate-limited API, or a single test
  account. One owner keeps the pacing coherent and the request log in one place.
- **Split work that needs eyes from work that doesn't.** A worktree usually can't be checked
  in a browser (its dev URL may not resolve, and there is only one real environment). Beads
  that need visual or browser verification run **one at a time in the main checkout**.
  Code-only beads run in parallel worktrees and are merged. Never merge into a checkout
  while an agent is working in it; merge between that agent's tasks.
- **When two parallel chains meet at an interface**, fix the interface first as a contract
  (a bead note or a doc naming components, props, routes or schemas). Both agents build to
  it, one against stubs until the other lands, and any change is noted on both beads.
- When a decision unlocks a large bead, split it into children with dependencies so the
  pieces can be planned and handed off separately:

  ```bash
  bd create "Migrate user_roles.role_id to text" --parent <epic> --deps blocked-by:<decision-bead>
  bd dep add <later-child> <earlier-child>
  ```

Write the plan as a note on the epic — waves, which agent owns which beads and which areas,
and why anything is serialised. When the batch has no shared parent, the first bead of the
batch is the session's home: the plan and the session result go there, and the other beads
get a one-line note pointing to it. Show the user the plan in a few lines.

## Phase 3 — Launch agents

Build each prompt from `references/agent-prompt.md`. Every prompt is self-contained: the
agent sees none of this conversation, so it gets the bead IDs, the binding decisions, the
areas other agents own, the git and deploy policy, and the report format spelled out.

- Parallel agents run in isolated worktrees. A new worktree may be based on unpushed local
  commits, so the prompt tells the agent which base to use: the remote base when one exists
  and is current, local `main` when there is no remote or the work is unpushed. The agent
  then installs dependencies fresh.
- Your own worktree isolation applies to the repo you are running in. When the code lives in
  a different repo from the beads (or from your working directory), agents create their
  worktrees themselves (`git -C <repo> worktree add ../<repo>-wt/<name> -b <branch> main`).
  They reach the beads with `BEADS_DIR=<beads repo>/.beads bd ...`. Put both in the prompt.
- **Probe harness isolation before the first wave.** A hook that rewrites commands (one
  that wraps every command in `rtk`, say) can collide with the harness's worktree guard, so
  an isolated agent cannot run git at all, and the refusal is inconsistent between agents
  in the same session. Before dispatching a wave into harness-isolated worktrees, dispatch
  one tiny isolated probe (`git status`, `npm ci --dry-run` or the equivalent, `bd show
  <id>`) and wait for it. If git is refused, launch the agents un-isolated and have them
  create their own worktrees with `git worktree add`, as for the other-repo case above.
  Every prompt, isolated or not, carries the hard-stop rule from
  `references/agent-prompt.md` section 5: a refused git command means stop and report the
  refusal text, never a wrapper script or a workaround. An agent that tries one is flagged
  as a bypass and locked out of bd and file reads too.
- Per-checkout dev environments collide: two worktrees of a DDEV, Lando or Docker Compose
  project have the same project name. Tell each agent how to give its environment a unique,
  uncommitted name (e.g. `.ddev/config.local.yaml`), and to stop it when done.
- Serial chains inside one agent run in the order of their dependencies.
- **Hand each agent the memories that apply, not `bd prime`.** You read all of `bd prime` in
  Phase 0, and it is 20k tokens or more that would otherwise sit in every agent's context for
  every request. For each agent: take the keywords from its beads (the tools, frameworks, paths and
  deploy targets they name), run `bd memories <keyword>` for each, and paste the matches into
  the prompt verbatim, at most about eight. Paraphrasing loses the trap that made the memory
  worth saving. Always include memories on the user's standing conventions (signing,
  attribution, push policy). Note the keys you passed on the bead (`bd note <id> "memories
  passed: <keys>"`) so it is clear afterwards what the agent was and wasn't told.
- Launch all agents of a wave in one message so they run concurrently.

## Phase 4 — Orchestrate as reports arrive

When an agent reports (format in `references/agent-report.md`):

1. **Relay it** to the user concisely and in plain language: what shipped (with commit
   hashes), what is unverified, what needs them. Lead with anything alarming — unsigned
   commits, rewritten history, a failed deploy, a security warning.
2. **Check claims that don't add up** against the repo yourself (`git log`, `bd show`, CI
   status). A report is a claim, not evidence. Check alarming claims, such as a leaked
   secret, data loss or a broken main, **before** you relay them. Look at the actual value,
   not the field name. A false alarm spends the user's attention, and a P1 bead filed on
   one misleads the next session. If it's false, close the bead with your evidence and tell
   the agent.
3. **Surface odd behaviour honestly.** If an agent bypassed a guard, skipped a gate, or did
   something outside its brief, tell the user plainly, even if the result looks fine.
4. **Re-check the queue and launch the next wave** as soon as its dependencies have landed.
   Run `bd ready` again after every close: the plan was written before anything landed, and
   closing a bead can unblock beads the plan didn't list, or children an agent filed along
   the way. Anything in scope that is now ready gets planned and launched. Don't wait for
   the whole current wave if the next bead only needed one of them.

**Continue a finished agent rather than starting a new one** when its next bead is in the
same group (Phase 2): same area, same files, one chain. SendMessage resumes it with its
context intact: the repo layout, the gotchas and its own earlier work. Give it the new bead,
what has changed on main since, any new boundaries, and any memories that apply to the new
bead and were not in its first brief. Across groups, start fresh: a new agent in the same
worktree, briefed from the hand-off notes. Start fresh too when the finished agent's report
or task notification shows hundreds of tool uses; that is the signal its context is large,
and the next bead would carry all of it on every request. Resuming needs the agent's
worktree to still exist, so don't remove one you may continue (Phase 5).

**When you need agents to stop** (the user asks, quota is running low, the plan changes),
send each running agent this stop request via SendMessage rather than killing the task. A
killed agent leaves a dirty tree and no note; an agent given this stops within a tool round
or two with a clean tree and a hand-off:

1. Finish only the edit you are in the middle of, and only if it is seconds from done.
2. Run the gates once. Commit every coherent piece that passes, as atomic Conventional
   Commits. Do not push anything new; let an in-flight push finish its CI watch.
3. `bd note <bead>` with what is committed (hashes, and what each covers), what is
   uncommitted and partial, what the next step is, and the worktree path and branch.
4. Reply with the report format, kept short. Leave the worktree in place.

**When agents stop early** (usage limits, crashes, API errors), several can die at once,
mid-task. Before resuming anything:

1. Take stock. Look at each checkout's `git status` and its commits since the last merge,
   and at `bd show` for each bead in flight. Record on the epic what survived.
2. Resume the same agents via SendMessage. Tell them what state they left, that their own
   sub-agents are gone, and to sort their work into complete and partial rather than
   assuming it is done.
3. If quota is short, send the stop request above instead of a resume: verified work gets
   committed first, and if they can't finish, a bead note says exactly what's done, what's
   partial and what's next, with nothing uncommitted.

When a new decision comes up mid-session — from the user or surfaced by an agent — record it
on the bead first, then message the running agent it affects (SendMessage) with the
correction. When the user changes their mind, update the bead's note to say what changed and
when, and tell every affected agent.

## Phase 5 — Close out

Close out only when nothing in scope is ready to build, or everything left needs the user
or a decision only they can make. Say which it is. If you are unsure whether the remaining
beads are in scope, ask rather than stopping.

1. **Verify it yourself.** Main's history (signatures if the user signs, no stray
   attribution), CI on the final commit, and live health for anything deployed.
2. **Write the session result** as a note on the epic: beads shipped (with commits), what
   waits on the user, and what shipped unverified.
3. **Clean up worktrees, after the session's last wave.** A harness-isolated agent cannot
   be resumed once its worktree is gone (SendMessage fails with "its worktree no longer
   exists"), so a clean, merged worktree stays in place until you are sure you will not
   continue that agent. An agent that made its own worktree with `git worktree add` is a
   plain path to the harness and survives removal, but apply the same rule. Then, for each,
   confirm its branch is merged and the tree is clean, and remove it along with its dev
   environment (e.g. `ddev delete -Oy`) and its merged branch. Leave anything unmerged or
   dirty and say so.
4. **Save what the next session needs** that the beads don't hold: how the user wants these
   sessions run (lanes, conventions, where things live), as a `bd remember` memory, updated
   in place rather than duplicated.
5. **Offer ADRs** for the design choices the session made autonomously — status *proposed*
   where you or an agent decided, *accepted* where the user decided — with a review bead so
   the user gets round to them.
6. **Hand off** with a crisp list of what the user must do: decisions pending, things to
   verify by eye, pushes held back behind a precondition, people to contact.

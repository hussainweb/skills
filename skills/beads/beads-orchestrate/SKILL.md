---
name: beads-orchestrate
description: Run a multi-agent development session over a batch of beads (`bd`) issues, with beads as the shared memory between isolated implementation agents. Use this skill whenever the user wants to hand a set of beads, an epic, or the ready queue to agents and step away — "pick up some beads and implement them with agents", "run a session on this epic", "work through the ready beads", "I'm stepping away, keep going", "parallelise these issues". Not for working a single bead yourself, and not for filing or triaging beads without implementing them.
allowed-tools: Bash, Read, Grep, Glob, Agent, SendMessage, AskUserQuestion
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Beads orchestration

You are the orchestrator of a development session. The user hands you a batch of beads
work and steps away; implementation agents do the building, and you keep the session
moving: settle decisions up front, plan who does what, launch agents, relay what they
report, and close out cleanly.

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

## Phase 0 — Load context

1. Run `bd prime` and read all of it. The output is long and tools may persist it to a file
   with only a preview shown; read the saved file end to end. It carries the workflow rules
   and the memories every session is meant to have.
2. Read the repo's `AGENTS.md` and `CLAUDE.md` (and anything they point to). These hold the
   quality gates, commit conventions and deploy rules you will pass to agents.
3. Read the target: `bd show <epic>` and `bd show` each child, including notes. Notes carry
   the decisions and hand-offs from earlier sessions, and they often change what "ready"
   means. If the user named no epic, start from `bd ready`.

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

Tell the user early, in the same message as the questions:

- what will need them later (e.g. "no browser on this host, so the UI changes ship without a
  visual check"),
- what will ship unseen or unverified,
- what you will not do (contact people outside the session, merge to production without
  their say-so, whatever their policy rules out).

## Phase 2 — Plan the waves

Group the ready beads into waves using their dependencies (`bd dep`, `bd graph`) and the
files they will touch.

- Independent beads in different areas run **in parallel**, one agent each.
- Beads that touch the same area — the same auth code, both adding a database migration,
  both editing the lockfile — run **serially in one agent**. Two agents adding migrations in
  parallel will pick the same number; two agents editing a lockfile will conflict.
- Don't create agents you don't need: one agent per coherent chain, not one per bead. Every
  agent costs a cold start, a dependency install, and a report you must read.
- When a decision unlocks a large bead, split it into children with dependencies so the
  pieces can be planned and handed off separately:

  ```bash
  bd create "Migrate user_roles.role_id to text" --parent <epic> --deps blocked-by:<decision-bead>
  bd dep add <later-child> <earlier-child>
  ```

Write the plan as a note on the epic — waves, which agent owns which beads and which areas,
and why anything is serialised. Show the user the plan in a few lines.

## Phase 3 — Launch agents

Build each prompt from `references/agent-prompt.md`. Every prompt is self-contained: the
agent sees none of this conversation, so it gets the bead IDs, the binding decisions, the
areas other agents own, the git and deploy policy, and the report format spelled out.

- Parallel agents run in isolated worktrees. A new worktree may be based on unpushed local
  commits, so the prompt tells the agent to sync to the remote base first and install
  dependencies fresh.
- Serial chains inside one agent run in the order of their dependencies.
- Launch all agents of a wave in one message so they run concurrently.

## Phase 4 — Orchestrate as reports arrive

When an agent reports (format in `references/agent-report.md`):

1. **Relay it** to the user concisely and in plain language: what shipped (with commit
   hashes), what is unverified, what needs them. Lead with anything alarming — unsigned
   commits, rewritten history, a failed deploy, a security warning.
2. **Check claims that don't add up** against the repo yourself (`git log`, `bd show`, CI
   status). A report is a claim, not evidence.
3. **Surface odd behaviour honestly.** If an agent bypassed a guard, skipped a gate, or did
   something outside its brief, tell the user plainly, even if the result looks fine.
4. **Launch the next wave** as soon as its dependencies have landed. Don't wait for the whole
   current wave if the next bead only needed one of them.

When a new decision comes up mid-session — from the user or surfaced by an agent — record it
on the bead first, then message the running agent it affects (SendMessage) with the
correction. When the user changes their mind, update the bead's note to say what changed and
when, and tell every affected agent.

## Phase 5 — Close out

1. **Verify it yourself.** Main's history (signatures if the user signs, no stray
   attribution), CI on the final commit, and live health for anything deployed.
2. **Write the session result** as a note on the epic: beads shipped (with commits), what
   waits on the user, and what shipped unverified.
3. **Clean up worktrees.** For each, confirm its branch is merged and the tree is clean, then
   remove it. Leave anything unmerged or dirty and say so.
4. **Offer ADRs** for the design choices the session made autonomously — status *proposed*
   where you or an agent decided, *accepted* where the user decided — with a review bead so
   the user gets round to them.
5. **Hand off** with a crisp list of what the user must do: decisions pending, things to
   verify by eye, pushes held back behind a precondition, people to contact.

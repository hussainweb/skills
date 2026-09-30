# AI Coding Agent Skills

A collection of specialized skills for AI coding agents to enhance development workflows. Skills are tool-agnostic instruction sets that work with any AI agent that supports the skills format (Gemini CLI, Claude Code, etc.).

## Installation

Install all skills from this repository into your AI coding agent using the [`skills` CLI](https://skills.sh/docs/cli):

```bash
npx skills add hussainweb/skills
```

This downloads the skills and configures them for use with your AI agent.

## Available Skills

### Drupal

Modern Drupal development skills following Drupal 11+ and PHP 8.5 standards.

| Skill | Install | Description |
|-------|---------|-------------|
| [drupal-new-module](./skills/drupal/drupal-new-module/SKILL.md) | `npx skills add hussainweb/skills@drupal-new-module` | Scaffold new Drupal 11 modules with PSR-4 namespaces, OOP hooks, and modern PHP patterns |
| [drupal-review](./skills/drupal/drupal-review/SKILL.md) | `npx skills add hussainweb/skills@drupal-review` | Review Drupal code against team standards, security best practices, and caching requirements |
| [drupal-theme-review](./skills/drupal/drupal-theme-review/SKILL.md) | `npx skills add hussainweb/skills@drupal-theme-review` | Review Drupal theme code — Twig templates, libraries, JS behaviors, SDC, accessibility, and responsive images |
| [drupal-upgrade](./skills/drupal/drupal-upgrade/SKILL.md) | `npx skills add hussainweb/skills@drupal-upgrade` | Guide a Drupal major version upgrade end to end — readiness assessment, deprecation scanning, compatibility fixes, and upgrade planning |

### DDEV

Local development environment management with DDEV.

| Skill | Install | Description |
|-------|---------|-------------|
| [ddev](./skills/ddev/ddev/SKILL.md) | `npx skills add hussainweb/skills@ddev` | Guide command execution in DDEV-based projects — route commands through containers, manage add-ons, and configure services |

### Coolify

Deployment and operations on self-hosted Coolify.

| Skill | Install | Description |
|-------|---------|-------------|
| [coolify](./skills/coolify/coolify/SKILL.md) | `npx skills add hussainweb/skills@coolify` | Deploy and operate applications on Coolify v4.1+ — Docker Compose resources, environment-variable conventions, shared databases and Redis, PHP/Drupal deployments, GitHub Actions pipelines, and routing diagnostics |

### Atlassian

Drive Atlassian Cloud products from the command line.

| Skill | Install | Description |
|-------|---------|-------------|
| [acli](./skills/atlassian/acli/SKILL.md) | `npx skills add hussainweb/skills@acli` | Drive Atlassian Cloud (Jira and Confluence) via the `acli` CLI — work items, projects, boards, sprints, pages, spaces, and blogs, with API-token authentication |

### Git

Conventions for working with git history.

| Skill | Install | Description |
|-------|---------|-------------|
| [conventional-commits](./skills/git/conventional-commits/SKILL.md) | `npx skills add hussainweb/skills@conventional-commits` | Write commit messages following the Conventional Commits v1.0.0 specification — type, scope, description, and breaking-change conventions, with no agent attribution |

### GitHub

Repository automation driven through the `gh` CLI.

| Skill | Install | Description |
|-------|---------|-------------|
| [dependabot-config](./skills/github/dependabot-config/SKILL.md) | `npx skills add hussainweb/skills@dependabot-config` | Write and review `.github/dependabot.yml` — plain weekly schedules with no pinned time, every ecosystem in the repo covered, dependencies grouped by release family, and cooldown/multi-directory options used only where they earn their place |
| [merge-dependabot-prs](./skills/github/merge-dependabot-prs/SKILL.md) | `npx skills add hussainweb/skills@merge-dependabot-prs` | Batch-merge open Dependabot PRs — minor/patch bumps with green checks by default, rebase-merged with branch deletion, with overrides for majors, merge method, and CI gating; explains how safe each held-back major bump is for the project |

### Beads

Setting up and working with the [beads](https://github.com/gastownhall/beads) (`bd`) issue tracker, including multi-agent sessions driven by it.

| Skill | Install | Description |
|-------|---------|-------------|
| [beads-init](./skills/beads/beads-init/SKILL.md) | `npx skills add hussainweb/skills@beads-init` | Set up beads in a repo the way this author wants it — `bd init` with auto-export off, JSONL exports and gate-lock files ignored, and this clone marked maintainer, all folded into init's own commit; or `bd bootstrap` on a fresh clone with the per-clone wiring redone and bootstrap's footprint outside the database undone. Slash-command only, never auto-triggered |
| [beads-orchestrate](./skills/beads/beads-orchestrate/SKILL.md) | `npx skills add hussainweb/skills@beads-orchestrate` | Run a multi-agent session over an epic, a list of beads, or the ready queue — front-load the user's decisions, plan waves from dependencies and file overlap, launch self-contained agent prompts, relay reports, keep going as beads unblock, and close out, with beads notes as the shared memory |
| [beads-trim-memories](./skills/beads/beads-trim-memories/SKILL.md) | `npx skills add hussainweb/skills@beads-trim-memories` | Review the persistent memories `bd prime` injects into every session — check each against the repo and the beads, recommend keep, rewrite, move or drop, apply only what the user confirms, and park occasional knowledge on the bead it concerns or in a committed knowledge file. Slash-command only, never auto-triggered |

### Writing and notes

Personal writing voice and note-taking conventions.

| Skill | Install | Description |
|-------|---------|-------------|
| [hussainweb-writing-style](./skills/writing/hussainweb-writing-style/SKILL.md) | `npx skills add hussainweb/skills@hussainweb-writing-style` | Draft and edit blog posts, guides, TILs, and reflections in a conversational, empathetic, structured voice |
| [interviewer](./skills/writing/interviewer/SKILL.md) | `npx skills add hussainweb/skills@interviewer` | Conduct interactive Socratic interviews to draw out authentic insights, lived experiences, and nuances from the user before writing or planning |
| [logseq-organization](./skills/writing/logseq-organization/SKILL.md) | `npx skills add hussainweb/skills@logseq-organization` | Format and file Logseq notes to a specific vault's conventions — journals, tags, namespaces, and directory structure |
| [capture-learning](./skills/writing/capture-learning/SKILL.md) | `npx skills add hussainweb/skills@capture-learning` | Capture technical realizations to Logseq as they surface in conversation — non-obvious behaviors, corrected assumptions, and debugged root causes |

## Skill Anatomy

Skills are organized by technology or domain: each lives at
`skills/<category>/<skill-name>/`, and a skill directory contains:

- **`SKILL.md`** — The instruction set and metadata (name, description, allowed tools, argument hints).
- **`references/`** — Supporting reference documentation the skill can consult.
- **`evals/`** — Evaluation sets to test the skill's output quality.

## Adding New Skills

1. Create a new directory under the appropriate category in `skills/` (or create a new category directory).
2. Add a `SKILL.md` with frontmatter metadata and instructions.
3. Optionally add `references/` and `evals/` directories.
4. Update this README with the new skill.

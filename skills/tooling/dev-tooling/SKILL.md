---
name: dev-tooling
description: Check or set up a project's development toolchain for its stack — linters, type checkers, duplication and dead-code detection, CSS measurement with Project Wallace, and the language and MCP servers the agent uses. Use this skill whenever a project is created or scaffolded (npm create, create-next-app, composer create-project, laravel new, uv init, a new repository), even if tooling was not mentioned; when the user opens a project and wants its tooling checked, set up or brought to their standard; or on "set up the dev tooling", "what tools is this project missing", "init the linters", "add jscpd / oxlint / fallow / ty", "set up Serena", "index the docs for this project", or "configure this repo for the agent". Covers JavaScript, TypeScript, CSS, PHP, Drupal, Laravel and Python, including Drupal AI best practices and Laravel Boost. Not for fixing the findings those tools report, nor for Dependabot (that is dependabot-config).
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
metadata:
  authors: "Hussain Abbas"
  version: "0.1.0"
---

# Dev tooling

Every project should arrive at the same standard toolchain for its stack, whoever set it up and whenever. This skill detects the stack, compares the project against a catalog of preferred tools, and reports or closes the gap.

The catalog is the opinion; this file is only the loop. Tools, versions, configs and the reasons behind them live in `references/`, one file per layer, so adding a stack never touches the workflow.

## Modes

- **Check** — report what is present, missing, partial or conflicting, with the planned action for each. Change nothing. Use it when the user asks to check, audit or list what is missing, or when the request does not say.
- **Init** — check, then apply the plan and verify it. Use it when the user asks to set up, initialize, install or bring the project up to standard.
- **After scaffolding** — when the skill was triggered by a project being created rather than by a request about tooling, finish the scaffolding first, then run check mode and offer init in one line. The user asked for a project, not a toolchain, so do not install anything until they agree.

## The loop

1. **Detect.** Run `python3 scripts/detect.py <project-dir>`. It prints facts: the layers; each JavaScript package with its package manager, TypeScript files and catalog tools with versions; Composer tools and whether each is required directly or arrives transitively; CSS grouped by the package that owns it; the environment and whether DDEV is running; existing configs, with framework-scaffolded ones flagged; how tools are already run (GrumPHP, gulp, hooks, CI); gitignore rules that affect config file names; and machine binaries. Do not guess the stack from file names yourself; if the script misses something, fix the script.

2. **Load the catalogs** for the detected layers, in this order, and nothing else:
   - `references/universal.md` — always.
   - `references/javascript.md` for `javascript` or `typescript`.
   - `references/css.md` for `css`.
   - `references/php.md` for `php`, then `references/drupal.md` or `references/laravel.md` when those layers are present. A framework file replaces the matching PHP entries.
   - `references/python.md` for `python`.
   - `references/agent.md` — always, last, because it depends on the layers above.
   - `references/docs-index.md` — only when a Grounded Docs server is registered or the user opts into one, as `agent.md` describes.

3. **Build the status table.** One row per catalog entry that applies. An entry applies when its layer is detected for that location; each catalog says when an entry is skipped instead, such as a formatter row when a formatter already exists.

   | Tool | Where | Tier | Scope | Status | Action |
   |---|---|---|---|---|---|
   | oxlint | `web/themes/custom/site` | always | project | conflicting: ESLint configured | ask: replace ESLint |

   Status is one of:
   - **present**: installed and configured.
   - **partial**: installed but unconfigured, or configured for only some layers.
   - **outdated**: present, but below the version the catalog entry needs.
   - **missing**: not there at all.
   - **conflicting**: an established alternative is in place.

   "Where" is the manifest directory for per-package tools, or "machine" or "agent".

   **Evidence, in order:** the manifest (`composer.json`, `package.json`), then the lock file, then the install (`vendor/`, `node_modules/`). A tool that arrives transitively through a meta-package counts as present. When dependencies are not installed or the environment is stopped, say so at the top of the report. Statuses then rest on manifests and lock files, and verification waits for an install.

   **Also in use:** list tools the project runs that the catalog does not cover, such as phpmd or Lighthouse CI, in one line. Do not evaluate them.

   In check mode, print the table, the asks with one line of reason each, and the "also in use" line, then stop.

4. **Apply** (init mode only), by tier:
   - **always** — install and configure.
   - **usually** — install unless an established alternative is present; then report it.
   - **ask** — never install. List it with its reason, and do it only if the user says yes.

   Do machine-scope installs (global binaries, user-scope MCP registration) only after naming them in one line, since they change the user's machine rather than the repository. If DDEV is stopped, start it with `ddev start` before installing; check mode never starts it.

5. **Verify** every tool you touched with its catalog's verify step, and run it for real. Report what each tool found on its first run as counts. Fixing those findings is a separate task.

6. **Report.** The final table with each status after the run; the verify results; the asks still open; and anything unresolved, such as a catalog entry marked unsettled. Do not commit unless asked.

## Ground rules

- **Never remove or replace a tool the project already uses.** A project on ESLint, Prettier, mypy or Black has made a choice. Report the preferred alternative as an ask; do not migrate on your own.
- **A major upgrade of an existing tool is an ask.** When an always entry needs a newer major of something the project already has, such as oxlint's type-aware rules needing TypeScript 7 in a package on 5.x, the row is outdated and the upgrade is an ask.
- **Enforced checks beat written rules.** An agent can skip a sentence in `AGENTS.md`; it cannot skip a failing check. When a convention matters, prefer a lint rule, a type check or a test that fails over prose. When the user reports a mistake agents keep making, propose a custom lint rule for it, with a test, as an ask.
- **One check command.** After the tools are in place, make sure the project has a single command that runs all of them: lint, type check, duplication, health and tests. Reuse an orchestrator that already does this, such as GrumPHP or a `check` script. Otherwise propose a `check` script in the root `package.json` or Composer `scripts` that calls the others. Then propose two things as asks: running it on commit through the project's hook manager, and one line in `AGENTS.md` telling agents to run it after each change and fix what it reports.
- **Close the CI gap.** When the project has CI and a tool you added or found is not run there, propose the CI step as an ask. Tools that only run on one laptop drift; CI is where the standard holds.
- **Wire into the existing pipeline.** Before adding a package or Composer script, check the orchestrators the detect script lists. If GrumPHP, gulp, a hook manager or CI already runs a tool, add the new tool there or propose it there. Do not create a parallel script for something the pipeline already runs.
- **Respect each directory.** Install with the package manager the detect script names for that manifest directory. A Drupal theme's tooling goes in the theme, not the repository root. Workspace members install through the root.
- **Route through the environment.** In a DDEV project, run Composer, PHP and Node commands through `ddev` (the `ddev` skill has the rules). Machine-scope tools and agent-side servers run on the host.
- **Match the installed platform.** Tool versions follow the installed framework and runtime, not the newest ones. A Drupal 10 site on PHP 8.2 gets tools that support Drupal 10 and PHP 8.2.
- **Dev dependencies only.** Nothing in this catalog belongs in production dependencies.
- **Merge configs, never overwrite them.** When a config file exists, add to it, and keep includes and settings you did not write. When a tool's `init` command would overwrite an existing file, write the config by hand instead.
- **Check gitignore before naming a file.** If the detect script reports a candidate name as ignored, such as `phpstan.neon.dist` in a project that ignores `/*.dist`, use the undotted name the project already tracks.
- **Leave scaffolded files alone.** Files a framework regenerates, such as Drupal's webroot `.eslintrc.json`, are not the project's config. The detect script lists them separately.
- **Do not tune thresholds to pass.** If duplication, PHPStan level or a CSS limit fails on the first run, report the number and let the user choose the limit.
- **Use current versions.** The catalogs name packages, not pinned versions. Let the package manager resolve versions within the platform's limits. When a catalog flag does not match the installed version's `--help`, follow the tool and fix the catalog.

## Extending the catalog

A new stack is a new file in `references/` plus a detection block in `scripts/detect.py` that adds its layer name and the tools to look for. Each tool entry states:

- **Tier** — always, usually or ask.
- **Scope** — project dependency, project config, machine, or agent.
- **Present when** — the files or dependencies that prove it is installed and configured.
- **Install**, **Config** and **Wire-up** — the commands, a minimal config, and the package or Composer script to add.
- **Verify** — the command that proves it works, and what to report from it.
- **Conflicts** — the established alternatives that turn it into an ask.
- **Minimum version**, when the entry depends on one, so an older install reads as outdated.

Record the reason for each preference next to it, so a future reader can tell a deliberate choice from a default.

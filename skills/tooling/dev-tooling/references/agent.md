# Agent layer

How the coding agent gets language intelligence and tool access. Applies to every project, after the stack layers, because what it configures depends on them.

The direction: Serena is the primary route to language servers, because it works with any MCP client and adds symbol-level editing. An agent's own language server support, where it has any, is an optional extra.

## Translating the commands

The commands here use Claude Code's `claude mcp` CLI as the worked example. Translate each into the running agent's own mechanism, its MCP command or config file, and keep the scope the entry asks for:

- **local** — this user and this project, not committed.
- **user** — this user, every project.
- **project** — committed and shared with the team, such as Claude Code's `.mcp.json`.

"The agent's MCP list" means whatever shows the registered servers and whether they connect, such as `claude mcp list`. When the agent has no equivalent of a scope, say so and use the closest one that does not commit a machine-specific path.

## Serena

Wraps language servers as an MCP server, giving the agent symbol search, references and symbol-level edits.

Serena has three parts, and only the first is per machine:

1. **The program**, installed once per machine with uv. One install serves every project.
2. **The registration**, which tells the agent to start Serena for a project. Done per project.
3. **The project config**, `.serena/project.yml`, committed with the project.

### The program (once per machine)

- **Present when:** `serena` is on `PATH`. The detect script prints the installed version.
- **Install:** `uv tool install -p 3.13 serena-agent`.
- **Outdated when:** the installed major is below the latest `serena-agent` on PyPI. Upgrading with `uv tool upgrade serena-agent` changes it for every project on the machine, so it is a machine-scope action to name before running.

### The registration (per project)

- **Present when:** the agent's MCP config for this project has a `serena` server whose `--project` points at this project.
- **Register** at local scope, since the command and the absolute path are machine-specific. Never put Serena in the project's shared config. In Claude Code:

```sh
claude mcp add serena -- serena start-mcp-server --context claude-code --project "$(pwd)"
```

- **Context:** `--context` tells Serena which agent it serves, so it turns off the tools that duplicate the agent's own. Use the context named after the running agent, such as `claude-code`, `codex` or `copilot-cli`; `serena context list` shows them all. When none matches, use `ide`.
- **Alternative:** a single user-scope registration with `--project-from-cwd` instead of `--project "$(pwd)"` serves every project from its working directory. Use it only if the user asks; per-project registration is the default.

### The project config

- **Tier:** always
- **Scope:** config, `.serena/project.yml`.
- **Present when:** `.serena/project.yml` exists and its `language_servers` list covers every detected layer that has a server. A file that misses a layer counts as partial; Serena only auto-detects the most prominent language.
- **Create:** pass every server explicitly rather than relying on inference:

```sh
serena project create --language typescript --language php .
```

  Serena 1.7 writes the list under `language_servers:`, while some docs show `languages:`. The key has changed between releases, so read the file the installed version generates and edit that key in place; never hand-write the file from memory.
- **Server per layer** (identifiers verified against Serena 1.7.0; confirm with `serena project create --help` after an upgrade):

| Layer | Server | Note |
|---|---|---|
| typescript, javascript | `typescript` | `typescript_vts` (vtsls) is the alternative. |
| php, drupal, laravel | `php` | Intelephense. `php_phpactor` is the open-source alternative. |
| python | `python_ty` | Uses ty, matching the Python layer. |
| go | `go` | gopls, which must be on `PATH`; see `go.md`. |
| css with SCSS | `scss` | Ask; useful when the theme is maintained here, noise when the SCSS is vendored. |
| drupal | `yaml` | Optional; useful for services and routing files. |

- **Git:** commit `project.yml`, which Serena writes to be versioned. The first `serena project index` writes `.serena/.gitignore` with `/cache` and `/project.local.yml`; add `/logs` to it, because `health-check` writes logs there and Serena does not ignore them. If the project was created but never indexed, write that file yourself with all three lines. `.serena/memories/` stays tracked by default; leave that choice to the user.
- **Index:** `serena project index` builds the symbol cache. Run it after creating the config in a large codebase; say it can take minutes.
- **Verify:** `serena project health-check` passes. Report any server that fails to start; a missing runtime such as Node or PHP is the usual cause.

## Agent-native language servers

Some agents can run language servers themselves. They typically give post-edit diagnostics and read-only navigation, but no symbol editing. Check whether the running agent supports this; if it does not, skip the row.

- **Tier:** ask. Offer it when the user wants diagnostics after every edit.
- **Example, Claude Code:** language servers come as plugins, and run only in terminal sessions. The official ones are `typescript-lsp`, `php-lsp` (Intelephense), `pyright-lsp` and `gopls-lsp`, installed with `claude plugin install <name>@claude-plugins-official`. Each needs its server binary on `PATH`. There is no official ty or Laravel plugin.
- **Custom servers** such as `laravel-lsp` or TypeScript 7's `tsc --lsp --stdio` need whatever the agent uses to declare a server. In Claude Code that is a small plugin with a `.lsp.json` at its root, loaded from a local marketplace. Each entry takes `command`, `args` and `extensionToLanguage`:

```json
{
  "laravel": {
    "command": "laravel-lsp",
    "extensionToLanguage": { ".php": "php", ".blade.php": "blade" }
  }
}
```

  When two enabled servers claim the same extension, the first registered wins and the other is skipped with a warning. So `laravel-lsp` and `php-lsp` cannot both serve `.php`; pick one. Whether a compound extension like `.blade.php` matches is unverified; check `/plugin` for errors after installing.
- Do not build such a plugin as part of a toolchain pass. Propose it, and build it only when asked.

## Semble

Searches code by meaning, such as "where is authentication handled?", and returns the matching chunks instead of whole files. It fills the gap between Serena, which needs a symbol name, and Grep, which needs the literal text. It runs on CPU with a small local model: no API keys, no GPU, no server to run.

- **Tier:** ask, when the codebase is large or the user did not write most of it, such as an inherited Drupal or Laravel site. Skip it for a small project the user knows well; Grep and Serena already cover that. It is still before 1.0, so it is not a default.
- **Scope:** machine. The program, the sub-agent and the per-repository index cache all live outside the project, so nothing is committed. Name it as a machine-scope install before running it.
- **Present when:** `semble` is on `PATH` (the detect script prints `bin.semble`) and the agent has the `semble-search` sub-agent (in Claude Code, `~/.claude/agents/semble-search.md`) or a `semble` MCP server.
- **Install:** `--agent` names the running agent; `semble install --help` lists the ones it supports. In Claude Code:

```sh
uv tool install semble
semble install --agent claude --type subagent --yes
```

  Prefer the `semble-search` sub-agent over the MCP server: it keeps search results out of the main context and adds no tools to every session. Install the MCP server (`--type mcp`, user scope) when the user asks, or when the agent has no sub-agents.
- **Upgrade:** `semble install` pins the installed version into what it writes, so after `uv tool upgrade semble` rerun the install command to update the pin.
- **Ignored files:** Semble skips whatever `.gitignore` ignores, plus `node_modules` and similar. In a Drupal project that means core and contrib are not indexed, which suits searching custom code. Add a `.sembleignore` (gitignore syntax) only for generated code the project commits.
- **Verify:** `semble search "<a concept from this project>" .` returns snippets from the project's own code. The first run downloads the model, so it needs network access.

## Framework agent guidance

Some frameworks ship their own guidance packages for agents: guidelines, skills and sometimes an MCP server. They live in the framework catalogs, because they install through the framework's package manager:

- Drupal: `drupal/ai_best_practices`, in `drupal.md`.
- Laravel: Laravel Boost, in `laravel.md`.

Both manage a marked region inside `AGENTS.md` or an agent-specific file such as `CLAUDE.md` and leave the rest of the file alone. When the project already has hand-written agent files, read them first and say what the package will add.

## Documentation index

A [Grounded Docs](https://github.com/arabold/docs-mcp-server) server indexes documentation by library version and serves search over MCP, so the agent answers from the docs for the version the project uses instead of from training data. It matters most for frameworks newer than the model's knowledge. The user runs the server themselves; this catalog has no URL for it.

- **Tier:** ask, when no such server is registered and the project uses a framework with a recipe in `docs-index.md`. Give the reason in terms of this project: name the frameworks and versions the server would index, such as "Laravel 12 and Next.js 16 have recipes". Say the user needs a server running; the skill cannot start one. If they decline, do not offer it again in the same session.
- **Present when:** the agent's MCP list shows a server whose tools include `search_docs` and `scrape_docs`. The name is the user's choice; `grounded-docs` is the suggestion.
- **Register:** ask for the server's MCP URL, the one ending in `/mcp`. If the user gives an `/sse` URL, ask for the `/mcp` one instead: the SSE transport is deprecated. Register it at user scope, since one server serves every project. In Claude Code:

```sh
claude mcp add --scope user --transport http grounded-docs <url>
```

  Use project scope only when the user says the team shares the server. With authentication enabled on the server, the client needs a bearer token; follow the server's authentication docs rather than putting a token in a committed config.
- **Read-only endpoint:** if the user runs a second instance in read-only mode, which offers search but no scrape or remove tools, register that one for everyday sessions and use the full one only for indexing.
- **Before the first index:** vector search needs an embedding model configured on the server before documentation is indexed; documentation indexed without one gets no vectors until it is scraped again. Mention it once. Without embeddings, search matches words only, and a query phrased differently from the docs misses.
- **Index:** follow `docs-index.md` for the detected frameworks. Each scrape is an ask, because the index is shared by everyone who uses the server.
- **Verify:** the agent's MCP list shows the server connected, and `list_libraries` answers.

## MCP servers from project tools

Register these at project scope, in the config the team shares. The entries below are in the `mcpServers` JSON shape of Claude Code's `.mcp.json`; carry the command and arguments over to the agent's own format. Merge into an existing file; never overwrite it. Put them only where the agent reads MCP servers from: Claude Code, for one, ignores `mcpServers` in `.claude/settings.json` without an error.

### Fallow

- **Tier:** usually, when Fallow is installed in the root package or a workspace root. When it is installed only in a subpackage, such as a theme, the MCP entry would run from the repository root and download Fallow instead of using that install; make it an ask and say why.
- **Entry:** a dev-dependency install is not on `PATH`, so call it through the package manager:

```json
{
  "mcpServers": {
    "fallow": { "command": "npx", "args": ["--yes", "--package", "fallow", "fallow-mcp"] }
  }
}
```

  With pnpm use `"command": "pnpm", "args": ["exec", "fallow-mcp"]`. In a DDEV project, the agent still starts the server on the host, so Node must be available there.
- **Verify:** the agent's MCP list shows `fallow` connected, after the user approves the project server.

### Storybook

Lets the agent list components, read their documentation and stories, preview stories and run component tests, so it uses the design system's components as documented instead of guessing from code.

- **Tier:** ask, in a package that has `storybook` as a dependency. The detect script lists it.
- **Install:** `npx storybook add @storybook/addon-mcp`, run in that package.
- **Register:** the server runs inside Storybook's dev server, by default at `http://localhost:6006/mcp`. Register it at project scope so the team shares it, adjusting the port to the project's Storybook port. In Claude Code:

```sh
claude mcp add --scope project --transport http storybook http://localhost:6006/mcp
```

- **Constraint:** it only answers while Storybook's dev server runs. Say so in the report.

### Sentry Spotlight

Gives the agent the errors, logs and traces of the locally running app, so it can debug without the user pasting logs.

- **Tier:** ask, in a project whose code uses a Sentry SDK (the detect script lists `@sentry/*` packages). Without a Sentry SDK sending events, Spotlight has nothing to show.
- **Register:** it runs on the host, so register it at local scope. In Claude Code:

```sh
claude mcp add sentry-spotlight -- npx -y --prefer-online @spotlightjs/spotlight@latest mcp
```

- **Using it:** the app must send events to Spotlight, either by starting it with `spotlight run <dev command>` or by setting `SENTRY_SPOTLIGHT=1` in the development environment. Propose the one that fits the project's dev command.

### gopls

gopls has an MCP mode that gives the agent Go-specific tools, among them workspace symbol search, a file's context, a package's API, symbol references and diagnostics for edited files. It overlaps with Serena's `go` server; it adds diagnostics and Go-aware package summaries, and it costs a second gopls process.

- **Tier:** ask, in a project with the `go` layer. Offer it when the user does not use Serena, or wants diagnostics after every edit.
- **Entry:** it needs only `gopls` on `PATH`, so it can be shared at project scope:

```json
{
  "mcpServers": {
    "gopls": { "command": "gopls", "args": ["mcp"] }
  }
}
```

- **Guidance:** propose one line in `AGENTS.md` telling agents to run the diagnostics tool on edited Go files before running the tests, and to check symbol references before renaming or removing an exported symbol. Without it, agents fall back to Grep.
- **Verify:** the agent's MCP list shows `gopls` connected, after the user approves the project server. An old gopls without the `mcp` subcommand fails here; upgrade it as a machine-scope action.

### Laravel Boost

Registered by `php artisan boost:install`; see `laravel.md`. Do not add it by hand unless the installer's entry fails.

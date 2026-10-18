# Agent layer

How the coding agent gets language intelligence and tool access. Applies to every project, after the stack layers, because what it configures depends on them.

The direction: Serena is the primary route to language servers, because it works with any MCP client and adds symbol-level editing. Claude Code's native language server plugins are an optional extra.

## Serena

Wraps language servers as an MCP server, giving the agent symbol search, references and symbol-level edits.

Serena has three parts, and only the first is per machine:

1. **The program**, installed once per machine with uv. One install serves every project.
2. **The registration**, which tells Claude Code to start Serena for a project. Done per project.
3. **The project config**, `.serena/project.yml`, committed with the project.

### The program (once per machine)

- **Present when:** `serena` is on `PATH`. The detect script prints the installed version.
- **Install:** `uv tool install -p 3.13 serena-agent`.
- **Outdated when:** the installed major is below the latest `serena-agent` on PyPI. Upgrading with `uv tool upgrade serena-agent` changes it for every project on the machine, so it is a machine-scope action to name before running.

### The registration (per project)

- **Present when:** `claude mcp get serena`, run from the project directory, shows a server whose `--project` points at this project.
- **Register** at local scope, which is private to this user and this project and is not committed:

```sh
claude mcp add serena -- serena start-mcp-server --context claude-code --project "$(pwd)"
```

  The `claude-code` context turns off Serena tools that duplicate Claude Code's own. Never put Serena in the shared `.mcp.json`: the command and the absolute path are machine-specific.
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
| css with SCSS | `scss` | Ask; useful when the theme is maintained here, noise when the SCSS is vendored. |
| drupal | `yaml` | Optional; useful for services and routing files. |

- **Git:** commit `project.yml`, which Serena writes to be versioned. The first `serena project index` writes `.serena/.gitignore` with `/cache` and `/project.local.yml`; add `/logs` to it, because `health-check` writes logs there and Serena does not ignore them. If the project was created but never indexed, write that file yourself with all three lines. `.serena/memories/` stays tracked by default; leave that choice to the user.
- **Index:** `serena project index` builds the symbol cache. Run it after creating the config in a large codebase; say it can take minutes.
- **Verify:** `serena project health-check` passes. Report any server that fails to start; a missing runtime such as Node or PHP is the usual cause.

## Claude Code native language servers

Claude Code can run language servers itself through plugins. They give post-edit diagnostics and read-only navigation, but no symbol editing, and they run only in terminal sessions.

- **Tier:** ask. Offer it when the user works mainly in Claude Code and wants diagnostics after every edit.
- **Official plugins:** `typescript-lsp`, `php-lsp` (Intelephense) and `pyright-lsp`, installed with `claude plugin install <name>@claude-plugins-official`. Each needs its server binary on `PATH`. There is no official ty or Laravel plugin.
- **Custom servers** such as `laravel-lsp` or TypeScript 7's `tsc --lsp --stdio` need a small plugin with a `.lsp.json` at its root, loaded from a local marketplace. Each entry takes `command`, `args` and `extensionToLanguage`:

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

## Framework agent guidance

Some frameworks ship their own guidance packages for agents: guidelines, skills and sometimes an MCP server. They live in the framework catalogs, because they install through the framework's package manager:

- Drupal: `drupal/ai_best_practices`, in `drupal.md`.
- Laravel: Laravel Boost, in `laravel.md`.

Both manage a marked region inside `AGENTS.md` or `CLAUDE.md` and leave the rest of the file alone. When the project already has hand-written agent files, read them first and say what the package will add.

## MCP servers from project tools

Register these in the project's `.mcp.json`, which is shared with the team. Merge into an existing file; never overwrite it. Claude Code ignores `mcpServers` in `.claude/settings.json` without an error, so do not put them there.

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
- **Verify:** `claude mcp list` shows `fallow` connected, after the user approves the project server.

### Storybook

Lets the agent list components, read their documentation and stories, preview stories and run component tests, so it uses the design system's components as documented instead of guessing from code.

- **Tier:** ask, in a package that has `storybook` as a dependency. The detect script lists it.
- **Install:** `npx storybook add @storybook/addon-mcp`, run in that package.
- **Register:** the server runs inside Storybook's dev server, by default at `http://localhost:6006/mcp`. Register it at project scope so the team shares it, adjusting the port to the project's Storybook port:

```sh
claude mcp add --scope project --transport http storybook http://localhost:6006/mcp
```

- **Constraint:** it only answers while Storybook's dev server runs. Say so in the report.

### Sentry Spotlight

Gives the agent the errors, logs and traces of the locally running app, so it can debug without the user pasting logs.

- **Tier:** ask, in a project whose code uses a Sentry SDK (the detect script lists `@sentry/*` packages). Without a Sentry SDK sending events, Spotlight has nothing to show.
- **Register:** it runs on the host, so register it at local scope:

```sh
claude mcp add sentry-spotlight -- npx -y --prefer-online @spotlightjs/spotlight@latest mcp
```

- **Using it:** the app must send events to Spotlight, either by starting it with `spotlight run <dev command>` or by setting `SENTRY_SPOTLIGHT=1` in the development environment. Propose the one that fits the project's dev command.

### Laravel Boost

Registered by `php artisan boost:install`; see `laravel.md`. Do not add it by hand unless the installer's entry fails.

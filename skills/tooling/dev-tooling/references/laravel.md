# Laravel layer

Applies when the project has an `artisan` file and `composer.json` requires `laravel/framework`. Read `php.md` first: this layer replaces its PHPStan setup.

## Laravel Pint

- **Tier:** always. New Laravel applications ship with it, so it is usually present.
- **Present when:** `laravel/pint` is required.
- **Install:** `composer require --dev laravel/pint`. No config is needed; add `pint.json` only to change the preset.
- **Verify:** `vendor/bin/pint --test` runs. Report the count of files it would change; do not run the fixer.

## Larastan

- **Tier:** always, in place of plain PHPStan.
- **Present when:** `larastan/larastan` is required.
- **Install:** `composer require --dev larastan/larastan`.
- **Config:** `phpstan.neon` including the extension, unless the extension installer is present.

```neon
includes:
  - vendor/larastan/larastan/extension.neon
parameters:
  level: 5
  paths:
    - app
```

- **Verify:** `vendor/bin/phpstan analyse --no-progress` runs. Report the count.

## Laravel Boost

Laravel's agent guidance package: an MCP server with application, database, log and documentation tools; version-aware guidelines for the Laravel packages in use; Agent Skills; and project rules the team records as it goes.

- **Tier:** always
- **Scope:** project dependency and agent config.
- **Present when:** `laravel/boost` is in `require-dev` and `boost.json` exists. Required but without `boost.json` counts as partial: the package is there but `boost:install` never ran.
- **Install:** `composer require --dev laravel/boost`, then `php artisan boost:install`. The installer is interactive: it asks which agents and features to set up. The agent shell cannot answer prompts, so ask the user to run it themselves, through DDEV when present:

```sh
! ddev artisan boost:install
```

- **What it writes:** guideline files such as `CLAUDE.md` and `AGENTS.md` (it replaces only its `<laravel-boost-guidelines>` block in an existing file), skills for the detected packages, `.mcp.json` with a `laravel-boost` server, and `boost.json`.
- **Git:** Laravel says the generated `.mcp.json`, guideline files and `boost.json` may be gitignored, since `boost:install` and `boost:update` regenerate them. Follow what the project already does. `.ai/rules/`, where project rules live, must be committed.
- **Keep it current:** add `"@php artisan boost:update --ansi"` to Composer's `post-update-cmd` scripts unless it is already there.
- **MCP in DDEV:** Boost registers `php artisan boost:mcp`, which runs on the host. In a DDEV project, the host may lack the right PHP. If the server fails to connect, change the entry Boost wrote for the agent, such as the one in `.mcp.json`, to `"command": "ddev", "args": ["artisan", "boost:mcp"]`.
- **Verify:** `boost.json` exists, and the agent's MCP list shows `laravel-boost` connected.
- **Project conventions:** for an existing application, mention Boost's `infer-conventions` skill, which drafts project rules from the code for the user to approve. Running it is a separate task.

## Laravel LSP

The official, framework-aware language server for Laravel and Blade: completion, hovers, diagnostics, definitions and links for routes, views, config and translations.

- **Tier:** usually
- **Scope:** machine. It is a global binary, not a project dependency.
- **Present when:** `laravel-lsp` is on `PATH`.
- **Install:** `composer global require laravel/lsp`, with Composer's global bin directory on `PATH`. Requires PHP 8.2 or newer.
- **PHP environment:** the server auto-detects Herd, Valet, Sail, Lando and DDEV, then falls back to local PHP. In a DDEV project it needs no extra setting.
- **Agent wiring:** Serena has no Laravel server. Wiring it into an agent needs that agent's own language server support, such as a small local plugin in Claude Code; see `agent.md`. Editors with the official Laravel extension (VS Code, Zed, Sublime) start it on their own.

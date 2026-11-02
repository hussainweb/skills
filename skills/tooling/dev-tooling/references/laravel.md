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

- **What it writes:** guideline files such as `AGENTS.md` and `CLAUDE.md` (it replaces only its `<laravel-boost-guidelines>` block in an existing file), skills for the detected packages, `.mcp.json` with a `laravel-boost` server, and `boost.json`.
- **Git:** Laravel says the generated `.mcp.json`, guideline files and `boost.json` may be gitignored, since `boost:install` and `boost:update` regenerate them. Follow what the project already does. `.ai/rules/`, where project rules live, must be committed.
- **Keep it current:** add `"@php artisan boost:update --ansi"` to Composer's `post-update-cmd` scripts unless it is already there.
- **MCP in DDEV:** Boost registers `php artisan boost:mcp`, which runs on the host. In a DDEV project, the host may lack the right PHP. If the server fails to connect, change the entry Boost wrote for the agent, such as the one in `.mcp.json`, to `"command": "ddev", "args": ["artisan", "boost:mcp"]`.
- **Verify:** `boost.json` exists, and the agent's MCP list shows `laravel-boost` connected.
- **Project conventions:** for an existing application, mention Boost's `infer-conventions` skill, which drafts project rules from the code for the user to approve. Running it is a separate task.

## Laravel LSP

The official, framework-aware language server for Laravel and Blade: completion, hovers, diagnostics, definitions and links for routes, views, config and translations.

- **Tier:** ask, and only when the agent has its own language server support and the user wants Laravel-aware completions and diagnostics for the agent. Skip it otherwise: Serena cannot run it (its PHP servers are Intelephense, Phpactor and PHPantom, and it takes no custom servers), and Laravel Boost's MCP server already gives the agent routes, config and version-matched docs.
- **Scope:** project dependency. `laravel/lsp` ships the server as a prebuilt PHAR and requires only PHP, so `composer require --dev laravel/lsp` adds one package and puts it at `vendor/bin/laravel-lsp`. Prefer that over the global install the README shows, so it arrives with `composer install` like every other dependency. Add it only together with the agent wiring that uses it; on its own nothing runs it.
- **Present when:** `laravel/lsp` is in `require-dev`, or `laravel-lsp` is on `PATH`.
- **PHP environment:** the server auto-detects Herd, Valet, Sail, Lando and DDEV, then falls back to local PHP. In a DDEV project it needs no extra setting.
- **Agent wiring:** through the agent's own language server support; see "Agent-native language servers" in `agent.md`. Editors with the official Laravel extension (VS Code, Zed, Sublime) bundle and start their own copy, so they do not need the dependency.
- **One server per extension:** Laravel LSP is not a general PHP server; it does not find class definitions or method references. When it serves `.php`, general PHP navigation comes from Serena.

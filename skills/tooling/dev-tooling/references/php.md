# PHP layer

Applies when the project has a `composer.json`. Framework layers (`drupal.md`, `laravel.md`) build on this one and may replace entries here; read them after this file.

When the project uses DDEV, run every Composer and PHP command through it (`ddev composer require ...`, `ddev exec vendor/bin/phpstan`). The `ddev` skill covers the routing rules.

## PHPStan

- **Tier:** always
- **Scope:** project dependency and config.
- **Present when:** `phpstan/phpstan` is required, or `phpstan.neon` or `phpstan.neon.dist` exists.
- **Install:** `composer require --dev phpstan/phpstan phpstan/extension-installer`. The extension installer is a Composer plugin, so allow it first: `composer config allow-plugins.phpstan/extension-installer true`.
- **Config:** `phpstan.neon.dist`, committed, unless the project ignores `.dist` files or already tracks `phpstan.neon`; then use `phpstan.neon`. When a config exists, merge into it and keep any `includes` already there: without the extension installer, extensions are included by hand. Start at a level the codebase passes or nearly passes rather than at max, and say which level was chosen and why.

```neon
parameters:
  level: 6
  paths:
    - src
```

- **Wire-up:** `"phpstan": "phpstan analyse"` in Composer `scripts`. If GrumPHP runs PHPStan and passes paths itself (`use_grumphp_paths`), the config needs no `paths`, and a script is optional.
- **Verify:** `vendor/bin/phpstan analyse --no-progress` runs. Report the error count at the chosen level. Do not generate a baseline unless the user asks.

## Rector

- **Tier:** ask. It rewrites code, so it belongs in a deliberate upgrade or cleanup, not in a toolchain pass.

## PHP language server

Configured for the agent through Serena, not installed here. Serena's `php` server is Intelephense and is the default; `php_phpactor` is the open-source alternative. See `agent.md`.

# Ecosystem blocks

Copy-paste starting points, drawn from configs already in use. Adjust the group patterns
to the packages that are genuinely in the manifest — delete any family the repo does not
have rather than leaving an empty group behind.

Every block uses a bare `interval: weekly` with no `day:`, `time:` or `timezone:`.
Add those only when the user asks for a particular schedule, and then add them to
every entry in the file.

## Drupal site (composer + theme npm + actions)

The full shape for a Drupal site with a custom theme and a Playwright suite. Drop the
entries that do not apply.

```yaml
version: 2
updates:
  - package-ecosystem: "composer"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "Composer"
      include: "scope"
    versioning-strategy: increase-if-necessary
    groups:
      drupal-core:
        patterns:
          - "drupal/core*"
      drupal-projects:
        patterns:
          - "drupal/*"
        exclude-patterns:
          - "drupal/core*"
      dev-dependencies:
        dependency-type: "development"

  - package-ecosystem: "npm"
    directory: "/web/themes/custom/THEME/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "npm"
    groups:
      types:
        patterns:
          - "@types/*"
      linters:
        patterns:
          - "eslint*"
          - "stylelint*"
          - "@typescript-eslint/*"

  - package-ecosystem: "npm"
    directory: "/test/playwright/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "npm(test)"
    groups:
      playwright:
        patterns:
          - "@playwright/*"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "github-actions"
    groups:
      github-actions:
        patterns:
          - "actions/*"
      docker-actions:
        patterns:
          - "docker/*"
```

## Laravel application

```yaml
  - package-ecosystem: "composer"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      laravel-framework:
        patterns:
          - "laravel/*"
          - "illuminate/*"
      filament:
        patterns:
          - "filament/*"
      spatie:
        patterns:
          - "spatie/*"
      testing:
        patterns:
          - "phpunit/*"
          - "pestphp/*"
          - "mockery/*"
          - "fakerphp/*"
```

## Next.js / React application (npm)

Families in dependency order — framework, then UI, then data, then toolchain.

```yaml
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    groups:
      next:
        patterns:
          - "next"
          - "@next/*"
          - "eslint-config-next"
      react:
        patterns:
          - "react"
          - "react-dom"
          - "@types/react"
          - "@types/react-dom"
      tailwind:
        patterns:
          - "tailwindcss"
          - "@tailwindcss/*"
          - "tailwind-merge"
      drizzle:
        patterns:
          - "drizzle-orm"
          - "drizzle-kit"
      testing:
        patterns:
          - "vitest"
          - "@playwright/*"
      lint-and-types:
        patterns:
          - "eslint"
          - "eslint-*"
          - "typescript"
          - "@types/node"
```

## Astro site (npm)

Small enough that two groups cover it.

```yaml
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      astro-packages:
        patterns:
          - "astro"
          - "@astrojs/*"
      tooling:
        patterns:
          - "@biomejs/*"
          - "@types/*"
```

## GitHub Action repository (TypeScript)

An action's own dependencies split cleanly by role, and majors are worth isolating.

```yaml
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    groups:
      # Actions maintained by GitHub itself are released in lockstep
      # and safe to bump together, majors included.
      github-official:
        patterns:
          - actions/*
          - github/*

  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    groups:
      actions-toolkit:
        dependency-type: production
        patterns:
          - '@actions/*'
        update-types:
          - minor
          - patch
      lint:
        dependency-type: development
        patterns:
          - '*eslint*'
          - '*prettier*'
        update-types:
          - minor
          - patch
      test:
        dependency-type: development
        patterns:
          - '*jest*'
        update-types:
          - minor
          - patch
```

## Coolify / docker-compose deployment repo

These repos are mostly a compose file and a workflow, so the config stays minimal — no
groups needed, because there is little to group.

```yaml
version: 2
updates:
  - package-ecosystem: "docker-compose"
    directory: "/"
    schedule:
      interval: "weekly"
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## Python (pip or uv)

```yaml
  - package-ecosystem: "uv"
    directory: "/backend"
    schedule:
      interval: "weekly"
    groups:
      fastapi:
        patterns:
          - "fastapi"
          - "uvicorn"
          - "pydantic"
          - "starlette"
      testing:
        patterns:
          - "pytest"
          - "pytest-*"
      linting:
        patterns:
          - "ruff"
```

Use `package-ecosystem: "pip"` for `requirements.txt` / plain `pyproject.toml`, and
`"uv"` when there is a `uv.lock`.

## Go

```yaml
  - package-ecosystem: "gomod"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "go"
```

## Minimal repo

A library, a role, a template — one workflow directory and nothing else. This is a
complete, correct config; do not pad it.

```yaml
version: 2
updates:
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

## Cross-cutting extras

Rarely needed, but worth having the exact shape to hand.

**Lengthen the wait on majors** (the three-day default needs no config; this only
overrides the major case):

```yaml
    cooldown:
      semver-major-days: 14
```

**One package pinned across many services in a monorepo** — a single PR instead of one
per directory:

```yaml
  - package-ecosystem: "npm"
    directories:
      - "/services/*"
    schedule:
      interval: "weekly"
    groups:
      shared-deps:
        group-by: dependency-name
        patterns:
          - "*"
```

**Several themes that want identical treatment** — `directories` globs, `directory` does
not:

```yaml
  - package-ecosystem: "npm"
    directories:
      - "/web/themes/custom/*"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "npm"
```

Keep separate `directory:` entries instead when the paths deserve different groups,
prefixes, or cadence.

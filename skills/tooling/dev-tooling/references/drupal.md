# Drupal layer

Applies when `composer.json` requires `drupal/core` or `drupal/core-recommended`, or the webroot has a `core/` directory. Read `php.md` first: this layer replaces its PHPStan setup and adds coding standards.

Tool versions follow the installed core (the detect script prints it), not the newest Drupal. A Drupal 10 site gets the core-dev and coder versions that support Drupal 10.

## drupal/core-dev

Bundles the dev tooling core itself uses, at versions known to work with the installed core: `drupal/coder`, `phpstan/phpstan`, `mglaman/phpstan-drupal`, `phpstan/extension-installer`, `phpstan/phpstan-phpunit`, `vincentlanglet/twig-cs-fixer` and PHPUnit.

- **Tier:** always
- **Scope:** project dependency.
- **Present when:** `drupal/core-dev` is in `require-dev`. If it is, the next two entries are already installed; only their config can be missing.
- **Install:** `composer require --dev drupal/core-dev:<constraint> --with-all-dependencies`, matching the constraint of whichever of `drupal/core-recommended` or `drupal/core` the site requires.
- **Already covered:** when coder and phpstan-drupal are required individually, or arrive transitively through a quality meta-package (the detect script marks these `transitive`), core-dev is optional. Report it as such and do not add it.
- **Plugins to allow:** `dealerdirect/phpcodesniffer-composer-installer` and `phpstan/extension-installer`, via `composer config allow-plugins.<name> true`.

## Coding standards (drupal/coder)

- **Tier:** always
- **Scope:** config.
- **Present when:** a `phpcs.xml`, `phpcs.xml.dist` or `.phpcs.xml.dist` uses the `Drupal` standard or any of its sniffs. A ruleset that picks individual sniffs is a deliberate choice, not a partial setup.
- **Config:** `phpcs.xml.dist` at the project root, or `phpcs.xml` when the project ignores `.dist` files. Use the real webroot (`web` or `docroot`, from the detect script).

```xml
<?xml version="1.0"?>
<ruleset name="project">
  <file>web/modules/custom</file>
  <file>web/themes/custom</file>
  <arg name="extensions" value="php,module,inc,install,test,profile,theme,info,yml"/>
  <exclude-pattern>*/node_modules/*</exclude-pattern>
  <rule ref="Drupal"/>
  <rule ref="DrupalPractice"/>
</ruleset>
```

- **Wire-up:** `"phpcs": "phpcs"` and `"phpcbf": "phpcbf"` Composer scripts, unless GrumPHP already runs phpcs.
- **Verify:** `vendor/bin/phpcs -i` lists `Drupal` and `DrupalPractice`, and `vendor/bin/phpcs` runs. Report the counts.

## PHPStan for Drupal (mglaman/phpstan-drupal)

- **Tier:** always
- **Present when:** `mglaman/phpstan-drupal` is installed and PHPStan scans custom code, either through `paths` in the config or through paths GrumPHP passes.
- **Config:** with `phpstan/extension-installer`, phpstan-drupal loads on its own and the config only needs paths and a level. Without it, the config includes the extension by hand; keep those includes. A config with no `level` falls back to PHPStan's default; propose one after a real run.

```neon
parameters:
  level: 2
  paths:
    - web/modules/custom
    - web/themes/custom
```

  Drupal code usually starts low; raise the level once it passes.
- **Verify:** `vendor/bin/phpstan analyse --no-progress` runs without bootstrap errors. A bootstrap error usually means the webroot was not found; set `drupal.drupal_root` under `parameters`.

## Twig coding standards

`vincentlanglet/twig-cs-fixer` comes with core-dev. Mention it for themes with custom templates; it is an ask, since its fixer rewrites templates. When the project already runs `friendsoftwig/twigcs`, the row is conflicting.

## Scaffolded files are not project config

Drupal's scaffold plugin writes `.eslintrc.json`, `.prettierrc.json`, `.stylelintrc.json` and similar into the webroot and refreshes them on every `composer install`. They configure core's own JavaScript, not the site. Never edit them, and never count them as the site having ESLint or Prettier. Theme-level tooling lives in the theme's own directory. The detect script lists these files under `.scaffolded` keys.

## jscpd ignores

jscpd respects `.gitignore`. Add the webroot's `core/`, `modules/contrib/`, `themes/contrib/`, `profiles/contrib/`, `libraries/` and `sites/*/files/` to `.jscpd.json` only when the detect script does not report them as ignored.

## AI best practices (drupal/ai_best_practices)

Drupal's canonical, community-maintained guidance for AI agents, the Drupal counterpart to Laravel Boost. It ships Agent Skills and an `AGENTS.md` section, kept in sync by a Composer plugin.

- **Tier:** always
- **Scope:** project dependency and agent config.
- **Present when:** `drupal/ai_best_practices` is in `require-dev` and `ai_best_practices.yaml` exists at the root.
- **Status of the project:** development releases only (`1.0.x-dev`, no stable release yet). Install it at `@dev` and say so in the report.
- **Install:** allow the plugin, then require it:

```sh
composer config allow-plugins.drupal/ai_best_practices true
composer require --dev drupal/ai_best_practices:@dev
```

- **What it writes:**
  - `ai_best_practices.yaml` at the root, which controls which skills are discovered and where they go.
  - `AGENTS.md`. On first run it writes the whole file; afterwards it only replaces the region between its `ai-best-practices` markers.
  - `CLAUDE.md` and `GEMINI.md`, only when they do not exist yet.
  - The merged skills under `.agents/skills/` by default.
  - A `drupal-ai` Composer script and the `allow-plugins` entry.
- **Existing agent files:** if `AGENTS.md` exists without the markers, read it before installing and tell the user the plugin will take it over on first run. An existing `CLAUDE.md` or `GEMINI.md` is left alone, so check that it refers to `AGENTS.md`, as the ground rule in `SKILL.md` says.
- **Git:** commit `AGENTS.md`, `ai_best_practices.yaml` and the generated skills, so environments installed with `--no-dev`, such as CI and production builds, still give agents the guidance.
- **Update:** `composer update drupal/ai_best_practices` re-syncs the skills and the `AGENTS.md` region; `composer drupal-ai skills-sync` does the same without updating.
- **Verify:** `ai_best_practices.yaml` exists, `.agents/skills/` holds skills, and `AGENTS.md` has the marked region.
- **Overlap:** this repository's own Drupal skills (`drupal-review`, `drupal-new-module` and others) cover similar ground for the user personally. The project-level guidance is what the rest of the team and CI agents see, so install it regardless.

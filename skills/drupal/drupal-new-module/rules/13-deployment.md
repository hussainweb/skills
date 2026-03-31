# Deployment, DevOps, and Configuration Management

## Core Principle: "Code Up, Content Down"

- **Code** (modules, themes, config YAML) flows **up** from dev → staging → production.
- **Database and files** (content, media) flow **down** from production → staging → dev.
- Production is the source of truth for content. Git is the source of truth for code and config.

## Standard Post-Deploy Steps

```bash
# Drush 10.3+ — single command
drush deploy

# Which is equivalent to:
drush updb              # run database update hooks
drush config:import     # import config from code (sync directory)
drush cr                # clear all caches

# Full deploy script pattern (non-production)
git checkout main
git pull
composer install --no-dev
drush sql:sync @prod @self        # sync production DB down (NOT on production!)
drush rsync @prod:%files @self:%files  # sync production files down (NOT on production!)
drush deploy
```

**Never run `sql:sync` or `rsync` on production** — it would overwrite live data.

## Environment Workflow

```
local → feature branch → dev → staging → production
```

- **Local:** Full codebase, production DB synced down (sanitized), all dev modules enabled.
- **Dev:** Continuous deployment from main branch. Dev modules enabled. Verbose logging.
- **Staging:** Release candidate testing. Production DB synced. No dev modules.
- **Production:** Tagged releases only. Never direct commits. No dev modules.

## Configuration Split (Environment-Specific Config)

Use `drupal/config_split` to manage configuration that differs between environments.

### Setup Example

```yaml
# config/sync/config_split.config_split.production.yml
id: production
label: Production
status: true
folder: config/envs/production
module:
  views_ui: 0    # disable Views UI on production
  devel: 0       # disable Devel on production
  dblog: 0       # disable DB log on production
```

```bash
# On production:
drush config:import --source=config/sync --delta

# Or with the split-aware commands:
drush cim   # automatically applies active splits based on environment
```

### What to Put in Each Split

| Split | Modules to disable | Settings to override |
|---|---|---|
| Production | `views_ui`, `devel`, `dblog` | `system.logging` (errors off), CSS/JS aggregation on |
| Development | — | CSS/JS aggregation off, verbose logging, Twig debug |
| CI | `dblog` | Performance settings off |

## Disabling Development Modules on Production

Production environments must have these modules disabled:
- `views_ui` — Views editing UI
- `devel` / `kint` — Developer tools (security risk)
- `dblog` — Database logging (performance, storage)
- `field_ui` — Field UI editing

Enabling production instead:
- `syslog` — System logging to OS log (faster, enterprise log aggregation)

In `settings.php` for production:
```php
$config['system.logging']['error_level'] = 'hide';
$config['system.performance']['css']['preprocess'] = TRUE;
$config['system.performance']['js']['preprocess'] = TRUE;
```

## Composer Best Practices

```json
{
  "require": {
    "drupal/core-recommended": "^10",
    "drupal/pathauto": "^1.11"
  },
  "config": {
    "platform": {
      "php": "8.4.0"
    }
  },
  "extra": {
    "patches": {
      "drupal/some_module": {
        "Fix important bug #1234567": "patches/fix-bug.patch"
      }
    }
  }
}
```

**Rules:**
- Commit `composer.lock` to Git — it guarantees identical builds across environments.
- Use `composer install --no-dev` in production (excludes dev tools from the deployment).
- Set `platform.php` to enforce version parity — prevents a `composer update` from pulling packages incompatible with your PHP version.
- Never commit the `vendor/` directory.
- Never manually modify files in `vendor/` or `web/core` — use patches instead.
- Patching: use `cweagans/composer-patches` — patches are tracked in `composer.json`, applied automatically on `composer install`.

## Backup Before Production Deployment

```bash
# Create a database backup before any production deploy
drush @prod sql:dump > backup-$(date +%Y%m%d-%H%M%S).sql

# After a failed deployment, restore:
drush @prod sql:cli < backup-TIMESTAMP.sql
git checkout [previous-tag]
composer install --no-dev
drush deploy
```

Always verify a backup exists before any production change.

## Git Workflow

```bash
# Feature development
git checkout -b feature/my-feature
# ... make changes, export config ...
drush cex
git add config/sync/
git commit -m "Add new feature configuration"
git push origin feature/my-feature

# Create pull request → code review → merge to main
# Tag releases for production
git tag v1.2.0
git push origin v1.2.0
```

**Rules:**
- Never commit directly to the `main`/`master` branch.
- Use pull/merge requests for all changes — enables code review.
- Tag releases (`v1.1.0`, `v1.2.0`) for staging and production deployments.
- Run automated tests in CI on every pull request before merging.

## Drush Site Aliases

```php
// drush/sites/prod.site.yml
prod:
  host: prod.example.com
  user: deploy
  root: /var/www/html
  uri: https://www.example.com

staging:
  host: staging.example.com
  user: deploy
  root: /var/www/html
  uri: https://staging.example.com
```

```bash
# Run a command on production
drush @prod status
drush @prod sql:dump > backup.sql

# Sync production DB to local
drush sql:sync @prod @self
```

## Stage File Proxy (Development)

Install `drupal/stage_file_proxy` on non-production environments to serve files from production without syncing gigabytes of assets:

```php
// settings.local.php
$config['stage_file_proxy.settings']['origin'] = 'https://www.example.com';
$config['stage_file_proxy.settings']['hotlink'] = FALSE;
```

Files are fetched from production on first request and cached locally.

## Database Sanitization

When syncing the production database to a development environment, sanitize PII:

```bash
drush sql:sync @prod @self
drush sql:sanitize   # replaces emails and passwords with safe values
```

Or use a custom sanitize script to handle project-specific sensitive fields.

## Content Moderation and Deployment

When deploying with Content Moderation enabled:
1. Export and import config includes workflow definitions
2. Content in any workflow state persists across deployments
3. Test workflow transitions on staging before production

## Local Development Setup

1. Install DDEV (community-standard containerized environment)
2. Run `ddev start` to bring up the environment
3. `ddev drush sql:sync @prod @self` to pull production data
4. `ddev drush rsync @prod:%files @self:%files` to pull files
5. `ddev drush deploy` to apply any pending updates
6. `ddev drush user:login` to get a one-time admin login link

Local `settings.local.php` should include:
```php
// Disable production caches
$settings['cache']['bins']['render']        = 'cache.backend.null';
$settings['cache']['bins']['page']           = 'cache.backend.null';
$settings['cache']['bins']['dynamic_page_cache'] = 'cache.backend.null';

// Stage File Proxy
$config['stage_file_proxy.settings']['origin'] = 'https://www.example.com';

// Verbose error reporting
$config['system.logging']['error_level'] = 'verbose';
```

## Drush 13 — Modern Command Authoring

Drush 13 requires commands in `src/Drush/Commands/` and uses PHP attributes. The old `drush.services.yml` file and `DrushCommands` base class are both **deprecated** in Drush 13 and removed in Drush 14.

### New Command Structure

```
my_module/
  src/
    Drush/
      Commands/
        MyModuleCommands.php
```

```php
namespace Drupal\my_module\Drush\Commands;

use Drush\Commands\AutowireTrait;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(
  name: 'my_module:process',
  description: 'Process something in my module',
  aliases: ['mmp'],
)]
final class MyModuleCommands extends Command {

  // AutowireTrait provides automatic DI — no drush.services.yml needed
  use AutowireTrait;

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly LoggerInterface $logger,
  ) {
    parent::__construct();
  }

  protected function configure(): void {
    $this
      ->addArgument('id', InputArgument::REQUIRED, 'The entity ID to process')
      ->addOption('dry-run', NULL, InputOption::VALUE_NONE, 'Simulate without saving');
  }

  protected function execute(InputInterface $input, OutputInterface $output): int {
    $id     = $input->getArgument('id');
    $dryRun = $input->getOption('dry-run');
    // Logic here
    $output->writeln('Done.');
    return Command::SUCCESS;
  }
}
```

### Old Drush Style — Do Not Use in New Code

```php
// DEPRECATED — drush.services.yml-registered class extending DrushCommands
class OldStyleCommands extends DrushCommands {
  /**
   * @command my_module:process
   * @argument id The entity ID
   */
  public function process(string $id): void { ... }
}
```

---

## Recipes — Drupal 11 Configuration Packages

**Recipes** replace Distributions as the recommended way to apply reusable configuration. Unlike modules, recipes are applied once and leave no ongoing maintenance coupling.

### Recipe Structure

```
recipes/my-recipe/
├── recipe.yml        # metadata + instructions
└── config/           # optional: config YAML to install
```

```yaml
# recipe.yml
name: 'My Recipe'
description: 'Configures the site for a specific use case'
type: 'Site'

recipes:
  - core/recipes/content_editor_role

install:
  - my_module
  - pathauto
  - metatag

config:
  actions:
    my_module.settings:
      setMultiple:
        enabled: true
        max_items: 20
    core.extension:
      installModule:
        - views_ui   # only on dev environments — exclude from production recipe
```

### Applying a Recipe

```bash
# Via Drush (recommended)
drush recipe path/to/recipes/my-recipe

# Via core PHP script
php core/scripts/drupal recipe path/to/recipes/my-recipe
```

### Recipe vs Module vs Distribution

| | Recipe | Module | Distribution |
|---|---|---|---|
| Applied once | Yes | No (installed/uninstalled) | At install only |
| Ongoing maintenance | None | Yes | Yes (coupled to distro) |
| Reversible | No | Yes | No |
| Config changes after apply | Site owns it | Module owns it | Distro owns it |
| Composer distribution | Yes (`composer/installers`) | Yes | Yes |

**Use Recipes** for: initial site configuration, enabling a set of features, applying a content model without ongoing module coupling.

---

## Key Admin Paths Reference

| Path | Purpose |
|---|---|
| `/admin/reports/status` | Site status, warnings, errors, platform requirements |
| `/admin/config/development/configuration` | Config sync: compare filesystem vs database |
| `/admin/config/development/performance` | Cache settings, CSS/JS aggregation |
| `/admin/config/development/logging` | Error reporting verbosity |
| `/admin/config/development/settings` | Twig debug, cache disable (Drupal 10.1+) |
| `/admin/modules` | Enable/disable modules |
| `/admin/reports/updates` | Available security and module updates |
| `/admin/people/permissions` | Permission management |
| `/admin/structure/views` | Views management |
| `/admin/structure/types` | Content type management |
| `/admin/structure/taxonomy` | Taxonomy management |

# Major Version Upgrade Workflow

A generic, repeatable workflow for upgrading Drupal from one major version to the next (e.g., 10→11, 11→12). The same pattern has applied to every major upgrade since Drupal 8→9.

---

## Phase 1: Assess (on current major, latest minor)

**Goal:** Understand the scope of work before changing any code.

### 1.1 Update to the latest minor patch

The last minor of the current major is the bridge to the next. It contains all deprecation notices that tell you what will break.

```bash
composer update drupal/core-recommended --with-all-dependencies
drush updatedb && drush cr
```

### 1.2 Check infrastructure requirements

Every major version raises minimum versions of PHP, database server, and Composer. Before touching code, verify that your hosting environment meets the target requirements. Check drupal.org release notes for the exact matrix.

```bash
php -v                    # PHP version
mysql --version           # or mariadb, psql, sqlite3
composer --version        # Composer version
```

### 1.3 Run Upgrade Status

```bash
composer require --dev drupal/upgrade_status
drush en upgrade_status
```

Visit `/admin/reports/upgrade-status`. It reports on:
- **Custom modules and themes**: deprecated API usage, missing `core_version_requirement` declarations
- **Contrib modules**: whether a compatible release exists for the target version
- **Environment**: PHP version, database version, extension availability

Export the report. This is your work backlog.

### 1.4 Run static analysis

```bash
# PHPStan approach (preferred for CI integration)
composer require --dev mglaman/phpstan-drupal phpstan/phpstan-deprecation-rules
vendor/bin/phpstan analyse web/modules/custom web/themes/custom --level 2

# Or the simpler drupal-check
composer require --dev mglaman/drupal-check
vendor/bin/drupal-check web/modules/custom web/themes/custom
```

### 1.5 Inventory contrib modules

For each contrib module:
1. Check drupal.org for a release compatible with the target version
2. If no release exists: check the issue queue for a compatibility patch, or identify an alternative module
3. Note any modules that were removed from core in the target version — they may be available as contrib

**Rule:** Do not upgrade until every enabled module has a compatible release or a tested patch. Contrib readiness is the most common blocker.

---

## Phase 2: Fix (still on current major)

**Goal:** Resolve all deprecations and compatibility issues while the site is still running on the current major. This is the safest time to make changes because the old APIs still work — you can test both old and new patterns side by side.

### 2.1 Run Drupal Rector

```bash
composer require --dev drupal/rector
```

Create `rector.php` at the project root:

```php
use DrupalRector\Set\DrupalSetList;
use Rector\Config\RectorConfig;

return RectorConfig::configure()
    ->withPaths([
        __DIR__ . '/web/modules/custom',
        __DIR__ . '/web/themes/custom',
    ])
    ->withSets([
        // Use the set for your TARGET version:
        DrupalSetList::DRUPAL_11,
    ]);
```

```bash
# Preview changes
vendor/bin/rector process --dry-run

# Apply changes
vendor/bin/rector process
```

Review every change. Rector handles the bulk of mechanical replacements but cannot fix:
- Complex logic or dynamic calls
- Twig template syntax
- Configuration or schema changes
- Custom plugin architecture decisions

### 2.2 Fix remaining deprecations manually

Work through the Upgrade Status report item by item. For each deprecation:
1. Read the `@deprecated` docblock — it names the replacement
2. If unclear, search the change records at `drupal.org/list-changes/drupal`
3. Replace the deprecated call with the recommended alternative
4. Run tests

### 2.3 Update `core_version_requirement`

In every custom module and theme `*.info.yml`, declare compatibility with both versions during the transition:

```yaml
core_version_requirement: ^10 || ^11
```

### 2.4 Migrate text editors (if applicable)

If the target version removes a text editor (e.g., CKEditor 4 was removed in D11), migrate while still on the current major where the migration path exists.

```bash
# Example: enable the replacement editor module
drush en ckeditor5

# Reconfigure each text format to use the new editor
# Visit /admin/config/content/formats

# Uninstall the old editor module
drush pmu ckeditor
```

Custom editor plugins will need to be rewritten for the new editor's API. Plan time for this.

### 2.5 Migrate themes (if applicable)

If the target version removes themes your site depends on (base themes or admin themes), migrate while still on the current major.

**If using a removed base theme (e.g., Classy):**
- Option A: Install the contrib version of the removed theme (short-term bridge)
- Option B: Generate a standalone theme using Starterkit:
  ```bash
  php core/scripts/drupal generate-theme my_theme --starterkit starterkit_theme --path themes/custom
  ```
  Then port your customizations into the new theme.

**Check Twig templates** for deprecated syntax that the target Twig version will reject (e.g., `{% filter %}` → `{% apply %}`, `spaceless` tag removal).

### 2.6 Uninstall removed core modules

If the target version removes core modules your site uses, either:
- **Uninstall** them if no longer needed: `drush pmu module_name`
- **Install the contrib replacement** before upgrading: `composer require drupal/module_name`

The Upgrade Status report identifies which modules are affected.

### 2.7 Update contrib modules

Update all contrib to versions compatible with the target major:

```bash
composer update drupal/* --with-all-dependencies
drush updatedb && drush cr
```

### 2.8 Run tests

Run your full test suite on the current major after all fixes:

```bash
# PHPUnit
vendor/bin/phpunit --configuration web/core/phpunit.xml.dist web/modules/custom

# Functional / end-to-end
# (Nightwatch, Cypress, Playwright — whatever the project uses)
```

All tests must pass before proceeding to Phase 3.

---

## Phase 3: Upgrade (move to next major)

**Goal:** Switch the codebase to the new major version. If Phases 1 and 2 were thorough, this should be uneventful.

### 3.1 Back up everything

```bash
# Database
drush sql:dump --gzip > /path/to/backup-pre-upgrade.sql.gz

# Files
tar -czf /path/to/files-backup.tar.gz web/sites/default/files/

# Code is in Git — ensure everything is committed
git status
```

### 3.2 Update Composer dependencies

```bash
composer require \
  drupal/core-recommended:^NEXT \
  drupal/core-composer-scaffold:^NEXT \
  drupal/core-project-message:^NEXT \
  --update-with-all-dependencies --no-update

# If using core-dev for testing:
composer require drupal/core-dev:^NEXT --dev --update-with-all-dependencies --no-update

# Execute the update
composer update
```

Replace `^NEXT` with the target version constraint (e.g., `^11`, `^12`).

If Composer reports dependency conflicts:
```bash
# Diagnose what is blocking:
composer why-not drupal/core:^NEXT
```

### 3.3 Run database updates

```bash
drush updatedb
drush cr
```

### 3.4 Export and review configuration

```bash
drush config:export
git diff config/
```

Review any config changes introduced by core update hooks. Clean up orphaned configuration from removed modules:

```bash
# If a removed module left stale config:
drush config:delete module_name.settings
```

### 3.5 Smoke test

Verify critical functionality:
- [ ] Site loads (no white screen)
- [ ] Admin login works
- [ ] Content creation and editing
- [ ] Views and listings render correctly
- [ ] Custom forms submit without errors
- [ ] Search returns results
- [ ] REST / JSON:API endpoints respond
- [ ] Cron runs successfully
- [ ] File and media uploads work
- [ ] Email sending works
- [ ] Error log is clean (`/admin/reports/dblog` or syslog)

---

## Phase 4: Deploy to production

**Goal:** Apply the same upgrade to production with minimal downtime.

### 4.1 Pre-deployment

- [ ] Schedule a maintenance window
- [ ] Notify stakeholders
- [ ] Ensure the staging upgrade has been fully tested
- [ ] Take a fresh production database backup

### 4.2 Deployment sequence

```bash
# Enable maintenance mode
drush state:set system.maintenance_mode 1 --input-format=integer
drush cr

# Back up database
drush sql:dump --gzip > /path/to/prod-backup-pre-upgrade.sql.gz

# Deploy code (git pull, rsync, or CI/CD pipeline)
# ...

# Install Composer dependencies from lock file
composer install --no-dev

# Run database updates
drush updatedb

# Import configuration
drush config:import

# Clear caches
drush cr

# Disable maintenance mode
drush state:set system.maintenance_mode 0 --input-format=integer
drush cr
```

Or with Drush 10.3+: replace the `updatedb` + `config:import` + `cr` sequence with `drush deploy`.

### 4.3 Post-deployment

- [ ] Run the smoke test checklist from Phase 3
- [ ] Monitor error logs for the first 24 hours
- [ ] Keep the pre-upgrade database backup for at least 2 weeks

---

## Rollback Plan

If the upgrade fails in production:

```bash
# Restore the database
drush sql:drop
drush sql:cli < /path/to/prod-backup-pre-upgrade.sql.gz

# Restore the code to the previous version
git checkout tags/pre-upgrade-tag

# Install old dependencies
composer install --no-dev

# Clear caches
drush cr
```

**Rule:** Always tag the codebase before deploying a major upgrade so you have a clean rollback point.

---

## Ongoing: Prevent Upgrade Debt

After a successful upgrade, establish habits that make the next major upgrade trivial:

1. **Fix deprecations as they appear** in minor updates — don't defer them
2. **Run PHPStan in CI** with deprecation rules enabled — catch new deprecations automatically
3. **Keep contrib current** — modules that track Drupal minor releases are always ready for the next major
4. **Track dependency lifecycles** — know when Symfony, PHP, and your database reach EOL
5. **Run `upgrade_status` quarterly** — even mid-cycle, it shows how close you are to readiness for the next major

---

## Common Post-Upgrade Issues

| Symptom | Likely cause | Fix |
|---|---|---|
| White screen | PHP version mismatch or missing class | Check PHP error log; verify PHP version meets target requirements |
| "Class not found" | Deprecated class removed in new major | Search change records for the class name; replace with successor |
| Config schema errors | Orphaned config from removed module | `drush config:delete module_name.settings` |
| Twig errors | Deprecated syntax in templates | Check for `{% filter %}` (use `{% apply %}`), `spaceless` tag, `sameas` |
| Composer conflicts | Contrib module pinning old core dependency | `composer why-not drupal/core:^NEXT` to diagnose |
| Missing module | Core module moved to contrib | `composer require drupal/module_name` |

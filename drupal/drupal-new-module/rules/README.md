# Drupal Development Rules

These rules define the team standards for **Drupal 11 + PHP 8.5** development. Use these files as a checklist during code writing, review, and architecture decisions.

> **Target stack:** Drupal 11.x · PHP 8.4 minimum (8.5 recommended) · PHPUnit 11 · Drush 13

---

## Files

| File | Topics |
|---|---|
| [01-module-architecture.md](01-module-architecture.md) | Module structure, PSR-4, naming, YAML files |
| [02-services-dependency-injection.md](02-services-dependency-injection.md) | Services, DI patterns, tagged services |
| [03-plugins.md](03-plugins.md) | Plugin types, annotations, custom plugin managers |
| [04-entities.md](04-entities.md) | Content/config entities, CRUD, access, field definitions |
| [05-routing-access.md](05-routing-access.md) | Routes, controllers, access control, redirects |
| [06-forms.md](06-forms.md) | Form API, AJAX, validation, States API |
| [07-database.md](07-database.md) | Database API, schema, update hooks |
| [08-configuration.md](08-configuration.md) | Config API, State, UserData, TempStore |
| [09-caching.md](09-caching.md) | Tags, contexts, max-age, lazy builders |
| [10-security.md](10-security.md) | XSS, SQL injection, CSRF, access, file safety |
| [11-theming.md](11-theming.md) | Theme structure, Twig, libraries, JS behaviors, SDC |
| [12-testing.md](12-testing.md) | Unit, Kernel, Functional, FunctionalJavascript tests |
| [13-deployment.md](13-deployment.md) | Config splits, Drush 13, environments, Composer, Recipes |
| [14-oop-hooks.md](14-oop-hooks.md) | OOP `#[Hook]` system (Drupal 11.1+), ordering, preprocess, themes |
| [15-modern-php.md](15-modern-php.md) | PHP 8.1–8.5 features: readonly, enums, match, fibers, property hooks |

---

## Quick-Reference: The Most Critical Rules

### Architecture
- **Never put business logic in a theme.** If removing the theme breaks a feature, it belongs in a module.
- **Prefer site building over custom code.** Core → contrib → custom, in that order.
- **Custom code only for unique business logic** or third-party integrations that contrib cannot handle.

### PHP / OOP
- **Never use `\Drupal::` static calls inside service classes.** Use constructor injection.
- **Always provide an interface for entity types.** Enables mocking and documents the contract.
- **Controllers are thin.** They orchestrate services and return render arrays — no business logic.
- **Always define config schemas** in `config/schema/` for every config key you introduce.
- **Use PHP native `#[Attribute]` classes, not Doctrine `@Annotation` docblocks.** Plugins, entities, hooks, and tests all use PHP attributes in Drupal 11.
- **Use constructor property promotion with `private readonly`** for all injected services — eliminates property declaration boilerplate.
- **Implement hooks as OOP `#[Hook]` classes in `src/Hook/`** (Drupal 11.1+), not as procedural functions in `.module` files.
- **Add `hooks_converted: true` to `*.info.yml`** once all hooks are OOP — skips `.module` file scanning at runtime.

### Security
- **Never concatenate user input into SQL.** Always use DB API placeholders or the query builder.
- **Never use `|raw` in Twig on user-supplied content.** Twig auto-escapes by default — trust it.
- **Routes must have a `requirements:` key.** Without it access is denied; never omit or use `_access: 'TRUE'` carelessly on sensitive routes.
- **Add `_csrf_token: 'TRUE'` to any state-changing GET route** (callback routes, delete links).

### Caching
- **Every render array needs correct `#cache` metadata.** Missing tags/contexts cause stale content.
- **Use `|without()` instead of omitting fields in Twig** — preserves cache metadata bubbling.
- **Prefer `user.roles` over `user` as a cache context.** The `user` context is high-cardinality and effectively disables page caching.

### Theming
- **Never call `document.ready` or jQuery `$()` directly.** Use `Drupal.behaviors` with `once()`.
- **Use Twig debug mode** (`twig.config.debug: true`) to find template names and suggestion candidates.
- **Pass data from PHP to templates via preprocess functions**, not via direct template PHP logic.

### Config Management
- **Remove `uuid` before placing exported YAML in `config/install/`.** UUIDs are site-specific.
- **Version all config YAML in Git.** Config is code.
- **"Code up, content down."** Promote code to production; pull the production database down to dev.

### Deployment
- Standard post-deploy sequence: `drush updb && drush config:import && drush cr`
  (or `drush deploy` in Drush 10.3+)
- **Disable on production:** `views_ui`, `devel`, `dblog`. Use `syslog` instead of `dblog`.
- **Always back up the database before any production deployment.**

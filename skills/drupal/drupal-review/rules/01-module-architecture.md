# Module Architecture

## System Requirements (Drupal 11)

| Requirement | Minimum | Recommended |
|---|---|---|
| PHP | 8.4 | 8.5 |
| MySQL | 8.0 | latest |
| MariaDB | 10.6 | latest |
| PostgreSQL | 16 | latest |
| SQLite | 3.45 | latest |
| Composer | 2.7.0 | latest |
| Symfony | 7.1 | — |

## Module Directory Structure

```
my_module/
├── my_module.info.yml           # Required: module metadata
├── my_module.module             # Procedural hooks ONLY (schema/install cannot be OOP)
├── my_module.install            # hook_schema(), hook_update_N(), hook_install()
├── my_module.post_update.php    # hook_post_update_NAME() (data migrations)
├── my_module.routing.yml        # Route definitions
├── my_module.services.yml       # Service container definitions
├── my_module.permissions.yml    # Permission declarations
├── my_module.links.menu.yml     # Menu link definitions
├── my_module.links.task.yml     # Local task (tab) definitions
├── my_module.links.action.yml   # Action link definitions
├── my_module.libraries.yml      # CSS/JS asset libraries
├── config/
│   ├── install/                 # Config imported on module install
│   ├── optional/                # Config imported only if dependencies are met
│   └── schema/                  # Config schema — REQUIRED for every config key
├── src/                         # PSR-4 root → namespace \Drupal\my_module
│   ├── Hook/                    # OOP hook implementations (Drupal 11.1+)
│   │   └── MyModuleHooks.php
│   ├── Controller/
│   ├── Form/
│   ├── Plugin/
│   │   ├── Block/
│   │   ├── Field/
│   │   │   ├── FieldType/
│   │   │   ├── FieldWidget/
│   │   │   └── FieldFormatter/
│   │   ├── QueueWorker/
│   │   └── views/
│   ├── Entity/
│   ├── EventSubscriber/
│   ├── Access/
│   ├── Logger/
│   └── Routing/
├── templates/                   # Twig templates
├── js/                          # JavaScript files
└── tests/
    ├── src/
    │   ├── Unit/
    │   ├── Kernel/
    │   ├── Functional/
    │   └── FunctionalJavascript/
    └── modules/                 # Test-helper sub-modules
```

## Required info.yml

```yaml
name: My Module
description: Description of what this module does.
type: module
core_version_requirement: ^11
package: Custom
dependencies:
  - drupal:image
  - drupal:node
hooks_converted: true   # Drupal 11.1+: all hooks are OOP, skip .module file scanning
```

**Rules:**
- `name`, `type`, `core_version_requirement` are required.
- `core_version_requirement: ^11` for Drupal 11-only modules; use `^10 || ^11` for dual compatibility.
- `package: Custom` groups custom modules together in the UI.
- List all required modules under `dependencies` — Drupal enforces them before install.
- Use `drupal:module_name` format for core/contrib dependencies.
- Add `hooks_converted: true` once **all** hooks in the module are implemented via `#[Hook]` OOP classes. This skips `.module` file scanning for hooks and provides a measurable performance improvement.

## PSR-4 and Namespacing

| Namespace | Directory |
|---|---|
| `Drupal\my_module` | `src/` |
| `Drupal\my_module\Controller` | `src/Controller/` |
| `Drupal\my_module\Form` | `src/Form/` |
| `Drupal\my_module\Plugin\Block` | `src/Plugin/Block/` |
| `Drupal\my_module\Plugin\Field\FieldType` | `src/Plugin/Field/FieldType/` |
| `Drupal\my_module\Entity` | `src/Entity/` |
| `Drupal\my_module\EventSubscriber` | `src/EventSubscriber/` |
| `Drupal\my_module\Annotation` | `src/Annotation/` |
| `Drupal\Tests\my_module\Unit` | `tests/src/Unit/` |
| `Drupal\Tests\my_module\Kernel` | `tests/src/Kernel/` |
| `Drupal\Tests\my_module\Functional` | `tests/src/Functional/` |

**Rules:**
- One class per file. Filename must exactly match the class name (`HelloWorldSalutation.php`).
- Directory structure mirrors the namespace hierarchy.
- Never put classes directly in the module root — always under `src/`.

## Key YAML Files Summary

| File | What it declares |
|---|---|
| `*.info.yml` | Module name, type, version, dependencies |
| `*.routing.yml` | URL paths and their controller/access requirements |
| `*.services.yml` | PHP classes registered as services |
| `*.permissions.yml` | Human-readable permission strings |
| `*.links.menu.yml` | Admin/navigation menu links |
| `*.links.task.yml` | Tab links on entity/admin pages |
| `*.links.action.yml` | "Add" and operation action links |
| `*.libraries.yml` | CSS and JS asset definitions |
| `config/schema/*.schema.yml` | Type definitions for every config key |
| `config/install/*.yml` | Default config imported on module install |
| `config/optional/*.yml` | Config imported only if all dependencies exist |

## Naming Conventions

- **Module machine name:** lowercase letters, numbers, underscores only. Start with a letter. Max 50 chars.
- **Class names:** UpperCamelCase (`HelloWorldSalutation`)
- **Method/property names:** lowerCamelCase (`getSalutation()`)
- **Constants:** ALL_CAPS (`MY_MODULE_CONSTANT`)
- **Hook functions:** `modulename_hookname()` — snake_case, in `.module` file
- **Service IDs:** `module_name.service_name` (dot-separated)
- **Route names:** `module_name.route_name` (dot-separated)
- **Permission strings:** lowercase, human-readable (`administer my feature`)
- **Config names:** `module_name.config_type` (e.g., `hello_world.custom_salutation`)

## Submodules

Use submodules when a feature is:
- Optional (not all sites need it)
- Adds significant weight (extra DB tables, services)
- Could conflict with other modules

Example: `password_policy` → `password_policy_length`, `password_policy_special_character` as submodules.

## Module vs Theme Decision

| Belongs in Module | Belongs in Theme |
|---|---|
| Business logic | HTML markup / Twig templates |
| Custom routes and controllers | CSS and JavaScript |
| Service definitions | Preprocess for display-only variables |
| Permissions | Library definitions |
| Entity types and fields | Template suggestions |
| REST API endpoints | Theme settings |
| Views plugins | Region definitions |
| Queue workers | |
| Cron tasks | |

**Rule:** If removing the theme would break a feature, that feature belongs in a module.

## Removed in Drupal 11 (Do Not Use)

**Themes removed from core:** Bartik, Seven, Classy, Stable.
- Use `olivero` (default front-end) or `starterkit_theme`-generated custom theme.
- Use `claro` (default admin theme).

**Modules removed from core in Drupal 11.0:**
`activity_tracker`, `aggregator`, `book`, `color`, `forum`, `hal`, `quickedit`, `rdf`, `statistics`, `tour`, `ckeditor` (v4), `actions_ui`

**CKEditor 4 is fully removed.** CKEditor 5 is the only supported rich-text editor.

**`authorize.php` removed.** Composer is the only supported method for installing/updating modules and themes. The `/admin/modules/install` upload UI is also removed.

## Contrib Module Evaluation Order

1. **Drupal core** — most stable, best-maintained, zero upgrade risk
2. **Core Recipes** — declarative, one-time configuration packages; prefer over distributions
3. **Contrib modules** on drupal.org — check: well-adopted, actively maintained, Drupal 11 compatible
4. **Custom code** — only for unique business logic, third-party integrations, specific company requirements

Never jump to custom code before exhausting core and contrib options.

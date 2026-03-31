---
name: drupal-new-module
description: Scaffold a new Drupal 11 module following team standards: correct directory structure, PSR-4 namespaces, PHP 8.5 patterns, OOP hooks, and proper service definitions. Use this skill whenever someone wants to create a new Drupal module, add a plugin type, create a custom entity, or start a new Drupal component from scratch. Triggers on "create a module", "new drupal module", "scaffold a plugin", "I need a custom entity", "start a new module for X", or "help me set up the module structure for Y".
allowed-tools: Read, Write, Bash
argument-hint: [module-name] [brief description of what it does]
---

# Scaffold a New Drupal 11 Module

You are creating a new Drupal module that follows this team's coding standards. Getting the structure right from the start prevents a class of technical debt — wrong namespaces, missing service definitions, procedural hooks that should be OOP, and missing config schemas all compound over time.

**Rules library:** `rules/`

## Step 1: Gather requirements

If the user hasn't provided enough information, ask:
1. **Module machine name** (lowercase, underscores, e.g. `my_module`)
2. **What it does** — one sentence
3. **What components it needs** — check which apply:
   - [ ] Services (injectable business logic)
   - [ ] Routes and controllers
   - [ ] Forms
   - [ ] Plugins (Block, FieldType, QueueWorker, etc.)
   - [ ] Content entity (custom node-like thing)
   - [ ] Config entity (exportable configuration)
   - [ ] Event subscribers
   - [ ] Hooks (node presave, entity insert, etc.)
   - [ ] Drush commands
   - [ ] Tests

## Step 2: Load relevant rule files

Always read these before generating:
- `01-module-architecture.md` — structure, info.yml, naming conventions
- `14-oop-hooks.md` — if the module needs hooks
- `15-modern-php.md` — PHP 8.4/8.5 patterns that apply to all generated code

Then read the relevant component rules:
- `02-services-dependency-injection.md` — if services are needed
- `03-plugins.md` — if plugins are needed
- `04-entities.md` — if entities are needed
- `05-routing-access.md` — if routes/controllers are needed
- `06-forms.md` — if forms are needed
- `13-deployment.md` — if Drush commands are needed

## Step 3: Generate the module

Create files in the current working directory under `[module_name]/`. Generate only what is needed for the stated requirements — don't create empty placeholder files.

### Files to always generate

**`[module_name].info.yml`**
```yaml
name: '[Human-readable name]'
type: module
description: '[One-sentence description]'
core_version_requirement: ^11
package: Custom
hooks_converted: true
dependencies: []
```

**`src/` directory with PSR-4 classes** — namespace `Drupal\[module_name]`

### Conditional files

Generate these only when the module needs them:

| Component | Files to create |
|---|---|
| Services | `[module].services.yml`, `src/[ServiceName].php` with constructor property promotion |
| Controller + route | `[module].routing.yml`, `src/Controller/[Name]Controller.php` |
| Form | `src/Form/[Name]Form.php` extending `FormBase` or `ConfigFormBase` |
| Block plugin | `src/Plugin/Block/[Name]Block.php` with `#[Block(...)]` attribute |
| Queue worker | `src/Plugin/QueueWorker/[Name]Worker.php` with `#[QueueWorker(...)]` attribute |
| Content entity | `src/Entity/[Name].php` with `#[ContentEntityType(...)]` attribute, interface, list builder, form handlers |
| Config entity | `src/Entity/[Name].php` with `#[ConfigEntityType(...)]` attribute |
| Hooks | `src/Hook/[ModuleName]Hooks.php` with `#[Hook('hook_name')]` methods; register in `services.yml` |
| Drush commands | `src/Commands/[ModuleName]Commands.php` with `#[AsCommand(...)]` and `AutowireTrait` |
| Tests | `tests/src/Unit/`, `tests/src/Kernel/`, `tests/src/Functional/` as needed |
| Config schema | `config/schema/[module].schema.yml` — required if module introduces any configuration |

## PHP patterns to apply in all generated code

These aren't optional — they're the team's current standard and what code review will check for:

**Services and injection**
```php
// Always constructor property promotion + readonly for injected services
public function __construct(
  private readonly EntityTypeManagerInterface $entityTypeManager,
  private readonly ConfigFactoryInterface $configFactory,
) {}

// Static factory for service container
public static function create(ContainerInterface $container): static {
  return new static(
    $container->get('entity_type.manager'),
    $container->get('config.factory'),
  );
}
```

**Hooks — OOP only**
```php
// src/Hook/MyModuleHooks.php
namespace Drupal\my_module\Hook;

use Drupal\Core\Hook\Attribute\Hook;

class MyModuleHooks {
  #[Hook('node_presave')]
  public function nodePresave(NodeInterface $node): void {
    // logic here
  }
}
```
Register in `*.services.yml`:
```yaml
services:
  my_module.hooks:
    class: Drupal\my_module\Hook\MyModuleHooks
    tags:
      - { name: 'module_hook' }
```
Never put hooks as procedural functions in `*.module` (except `hook_schema`, `hook_install`, `hook_update_N`).

**Plugin attributes — never Doctrine annotations**
```php
use Drupal\Core\Block\Attribute\Block;
use Drupal\Core\StringTranslation\TranslatableMarkup;

#[Block(
  id: 'my_block',
  admin_label: new TranslatableMarkup('My Block'),
  category: new TranslatableMarkup('Custom'),
)]
class MyBlock extends BlockBase { ... }
```

**Type declarations everywhere**
```php
// All parameters, return types, and properties must be typed
public function process(int $id, string $label): array { ... }
public function save(): void { ... }
```

## Step 4: After generating

Tell the user:
1. What files were created and why
2. What to do next (e.g., "Run `drush cr` to clear caches after enabling the module")
3. Which rule files to read for the next steps (e.g., "See `03-plugins.md` if you need to add more plugin types")
4. Any decisions that were made on their behalf (e.g., "I used `EditorialContentEntityBase` because you mentioned publishing workflow — change to `ContentEntityBase` if you don't need revision/publishing support")

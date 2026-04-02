# OOP Hook System (Drupal 11.1+)

Drupal 11.1 introduced the `#[Hook]` attribute system. Hook implementations can now be methods in PHP classes instead of magic-named procedural functions in `.module` files. This is the **recommended approach for all new hook implementations** in Drupal 11.

## Why OOP Hooks?

| Old (procedural `.module`) | New (OOP `#[Hook]`) |
|---|---|
| No dependency injection | Full constructor DI |
| Global namespace functions | Organised in classes and namespaces |
| Performance: every `.module` file scanned | Only runs registered services |
| No ordering control | `OrderBefore`/`OrderAfter` classes |
| One function per hook | One class, multiple methods, multiple hooks |

## File Location

Hook classes live under `src/Hook/` and are **automatically discovered as services** — no `services.yml` entry needed:

```
my_module/
  src/
    Hook/
      MyModuleHooks.php       # general hooks
      NodeHooks.php           # node-specific hooks
      FormHooks.php           # form alters
```

Namespace: `Drupal\my_module\Hook\MyModuleHooks`

## Basic Syntax

```php
namespace Drupal\my_module\Hook;

use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\node\NodeInterface;

class MyModuleHooks {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
  ) {}

  #[Hook('node_presave')]
  public function nodePressave(NodeInterface $node): void {
    if ($node->bundle() === 'article') {
      // Perform pre-save logic using injected service
      $this->entityTypeManager->getStorage('node');
    }
  }

  #[Hook('cron')]
  public function cron(): void {
    // Cron logic with injected dependencies
  }
}
```

## Attaching Multiple Hooks to One Method

```php
class MyModuleHooks {

  #[Hook('node_insert')]
  #[Hook('node_update')]
  public function nodeInsertOrUpdate(NodeInterface $node): void {
    // Called after both insert AND update
  }
}
```

## Placing the Attribute on a Class (Single-Hook Classes)

```php
// Option A: attribute on method (most common)
class MyFormHooks {
  #[Hook('form_alter')]
  public function formAlter(array &$form, FormStateInterface $form_state, string $form_id): void {}
}

// Option B: attribute on class with explicit method name
#[Hook('form_alter', method: 'alterForms')]
class MyFormHooks {
  public function alterForms(array &$form, FormStateInterface $form_state, string $form_id): void {}
}

// Option C: __invoke (cleanest for single-hook classes)
#[Hook('form_alter')]
class FormAlterHook {
  public function __invoke(array &$form, FormStateInterface $form_state, string $form_id): void {}
}
```

## Dependency Injection in Hook Classes

Because hook classes are autowired services, standard constructor injection applies:

```php
namespace Drupal\my_module\Hook;

use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

class MyModuleHooks {

  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly ConfigFactoryInterface $configFactory,
    #[Autowire(service: 'logger.channel.my_module')]
    private readonly LoggerInterface $logger,
  ) {}

  #[Hook('entity_presave')]
  public function entityPresave($entity): void {
    $config = $this->configFactory->get('my_module.settings');
    if ($config->get('auto_tag')) {
      $this->logger->info('Auto-tagging entity @id', ['@id' => $entity->id()]);
    }
  }
}
```

## Hook Ordering (Drupal 11.2+)

Control the execution order of hook implementations across modules:

```php
use Drupal\Core\Hook\Attribute\Hook;
use Drupal\Core\Hook\Order\OrderAfter;
use Drupal\Core\Hook\Order\OrderBefore;
use Drupal\Core\Hook\Order\OrderFirst;
use Drupal\Core\Hook\Order\OrderLast;

class MyModuleHooks {

  // Run this form_alter after other_module's form_alter
  #[Hook('form_alter', order: new OrderAfter(['other_module']))]
  public function formAlter(array &$form, FormStateInterface $form_state, string $form_id): void {}

  // Run this node_presave before another_module
  #[Hook('node_presave', order: new OrderBefore(['another_module']))]
  public function nodePresave(NodeInterface $node): void {}

  // Always run first
  #[Hook('init', order: new OrderFirst())]
  public function init(): void {}

  // Always run last
  #[Hook('page_attachments', order: new OrderLast())]
  public function pageAttachments(array &$page): void {}
}
```

## OOP Preprocess Hooks (Drupal 11.2+)

Preprocess functions in modules can also be OOP:

```php
class MyModuleHooks {

  // Implements hook_preprocess_node()
  #[Hook('preprocess_node')]
  public function preprocessNode(array &$variables): void {
    $variables['my_extra_var'] = 'value';
  }

  // Implements hook_preprocess_block__my_module_block()
  #[Hook('preprocess_block__my_module_block')]
  public function preprocessMyBlock(array &$variables): void {
    // More specific preprocess
  }
}
```

## OOP Hooks in Themes (Drupal 11.3+)

Themes can also use OOP hooks with `#[Hook]`. Theme hook classes go in `THEME/src/Hook/`:

```php
// themes/custom/mytheme/src/Hook/MyThemeHooks.php
namespace Drupal\mytheme\Hook;

use Drupal\Core\Hook\Attribute\Hook;

class MyThemeHooks {

  #[Hook('preprocess_node')]
  public function preprocessNode(array &$variables): void {
    $variables['theme_variable'] = 'computed';
  }

  #[Hook('theme_suggestions_node_alter')]
  public function themeSuggestionsNodeAlter(array &$suggestions, array $variables): void {
    $suggestions[] = 'node__' . $variables['elements']['#node']->bundle() . '__custom';
  }
}
```

Add to `mytheme.info.yml`:
```yaml
hooks_converted: true
```

## Hooks That MUST Remain Procedural

The following hooks **cannot be implemented as OOP** because they run before the service container is fully available or have other bootstrap constraints:

```
hook_schema()
hook_install()
hook_uninstall()
hook_update_N()
hook_post_update_NAME()
hook_update_last_removed()
hook_hook_info()
hook_module_implements_alter()
hook_install_tasks()
hook_install_tasks_alter()
```

Additionally, **`hook_mail()`** and **`hook_help()`** cannot have multiple OOP implementations per module.

## Backward Compatibility Shim (Drupal 10.1–11.0)

For modules needing to support both Drupal 10.1+ and 11.1+, use the `#[LegacyHook]` bridge:

```php
// src/Hook/MyModuleHooks.php — unchanged, same as above

// my_module.module — procedural shim with #[LegacyHook]
use Drupal\Core\Hook\Attribute\LegacyHook;
use Drupal\my_module\Hook\MyModuleHooks;

// On Drupal 11.1+, this function is SKIPPED entirely (zero overhead)
// On Drupal 10.1–11.0, this delegates to the service
#[LegacyHook]
function my_module_node_presave($node): void {
  \Drupal::service(MyModuleHooks::class)->nodePresave($node);
}
```

If also registering the hook class as a service (needed for Drupal 10.x compatibility before autowire):

```yaml
# my_module.services.yml — only needed for Drupal 10.x compatibility
services:
  Drupal\my_module\Hook\MyModuleHooks:
    class: Drupal\my_module\Hook\MyModuleHooks
    autowire: true
```

## Enabling the `hooks_converted` Performance Flag

Once **every hook** in your module is implemented via `#[Hook]` classes (no remaining procedural hook functions in `.module` files), add:

```yaml
# my_module.info.yml
hooks_converted: true
```

This tells Drupal 11.1+ to skip loading and scanning the `.module` file entirely for runtime hooks. This provides meaningful performance gains on high-traffic sites.

**Do not add this flag if any procedural hooks remain in `.module`** — those would silently stop firing.

## Common Hook Examples

### Form Alter

```php
#[Hook('form_node_article_form_alter')]
public function formNodeArticleFormAlter(
  array &$form,
  FormStateInterface $form_state,
  string $form_id,
): void {
  $form['#submit'][] = [$this, 'nodeArticleSubmit'];
}

public function nodeArticleSubmit(array &$form, FormStateInterface $form_state): void {
  // Custom submit handler (plain method — not a hook)
}
```

### Entity CRUD Hooks

```php
#[Hook('node_presave')]
public function nodePresave(NodeInterface $node): void {}

#[Hook('node_insert')]
public function nodeInsert(NodeInterface $node): void {}

#[Hook('entity_delete')]
public function entityDelete(EntityInterface $entity): void {}
```

### Cron

```php
#[Hook('cron')]
public function cron(): void {
  $queue = \Drupal::queue('my_module_queue');
  // Add items to queue
}
```

### Page Attachments

```php
#[Hook('page_attachments')]
public function pageAttachments(array &$page): void {
  $page['#attached']['library'][] = 'my_module/global-styling';
}
```

### Theme Alter

```php
#[Hook('theme')]
public function theme(): array {
  return [
    'my_module_widget' => [
      'variables' => ['data' => NULL, 'label' => ''],
    ],
  ];
}
```

## Summary: When to Use What

| Situation | Use |
|---|---|
| New hook in Drupal 11+ only | OOP `#[Hook]` in `src/Hook/` |
| Dual Drupal 10.1+/11 support | OOP class + `#[LegacyHook]` procedural shim |
| Schema, install, update hooks | Procedural in `.install` — cannot be OOP |
| Module fully converted | Add `hooks_converted: true` to `*.info.yml` |
| Theme hooks (D11.3+) | OOP in `themes/custom/THEME/src/Hook/` |

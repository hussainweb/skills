# Routing, Controllers, and Access Control

## Route Definition

```yaml
# my_module.routing.yml

my_module.hello:
  path: '/my-page'
  defaults:
    _controller: 'Drupal\my_module\Controller\MyController::hello'
    _title: 'My Page'
  requirements:
    _permission: 'access content'

# Form route
my_module.settings:
  path: '/admin/config/my-module/settings'
  defaults:
    _form: 'Drupal\my_module\Form\SettingsForm'
    _title: 'My Module Settings'
  requirements:
    _permission: 'administer site configuration'

# Entity operation access
my_module.product_view:
  path: '/product/{product}'
  defaults:
    _controller: 'Drupal\my_module\Controller\ProductController::view'
    _title_callback: 'Drupal\my_module\Controller\ProductController::title'
  requirements:
    _entity_access: 'product.view'
  options:
    parameters:
      product:
        type: entity:product      # automatic entity upcasting

# CSRF-protected callback route
my_module.delete_item:
  path: '/item/{item}/delete'
  defaults:
    _controller: 'Drupal\my_module\Controller\ItemController::delete'
  requirements:
    _permission: 'delete items'
    _csrf_token: 'TRUE'

# Custom service-based access check
my_module.special:
  path: '/special'
  defaults:
    _controller: 'Drupal\my_module\Controller\SpecialController::page'
  requirements:
    _my_module_access_check: 'TRUE'

# Fully open route (use with extreme caution)
my_module.public:
  path: '/public-feed'
  defaults:
    _controller: 'Drupal\my_module\Controller\FeedController::feed'
  requirements:
    _access: 'TRUE'
```

**Rules:**
- **Always include a `requirements:` key.** A route without requirements denies access by default; it is not "open".
- **Never use `_access: 'TRUE'` on routes that perform any state change or reveal sensitive data.**
- Use `_csrf_token: 'TRUE'` on any state-changing route accessed via a link (not a form submit).
- Use `_entity_access: 'entity_type.operation'` rather than `_permission` when the access depends on the entity.

## Multiple Permission Requirements

```yaml
# AND: both permissions required
requirements:
  _permission: 'my permission,administer site configuration'

# OR: either permission is sufficient
requirements:
  _permission: 'my permission+administer site configuration'
```

## Controller

```php
namespace Drupal\my_module\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Session\AccountInterface;
use Symfony\Component\DependencyInjection\ContainerInterface;

class MyController extends ControllerBase {

  public function __construct(
    protected readonly MyService $myService,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static($container->get('my_module.my_service'));
  }

  // Returns a render array
  public function hello(): array {
    return [
      '#theme' => 'my_module_hello',
      '#message' => $this->myService->getMessage(),
    ];
  }

  // Dynamic title callback
  public function title(EntityInterface $entity): string {
    return $entity->label();
  }

  // Static access callback on a route (alternative to service-based checker)
  public function access(AccountInterface $account): AccessResult {
    return AccessResult::allowedIfHasPermission($account, 'access my feature')
      ->addCacheContexts(['user.roles']);
  }
}
```

**Rules:**
- Controllers extend `ControllerBase` — gives access to `entityTypeManager()`, `config()`, `currentUser()`, etc.
- Controller methods return **render arrays** or Response objects.
- **Never put business logic in controllers.** Delegate to services.
- Access control belongs in the route requirements system, not in controller method body.
- Title callbacks return a `string` (translated).

## Service-Based Access Checker

For complex access logic reused across many routes:

```php
// src/Access/MyAccessChecker.php
use Drupal\Core\Access\AccessResult;
use Drupal\Core\Routing\Access\AccessInterface;
use Drupal\Core\Session\AccountInterface;

class MyAccessChecker implements AccessInterface {
  public function access(AccountInterface $account): AccessResult {
    return AccessResult::allowedIf(
      $account->hasPermission('my permission')
      && $account->isAuthenticated()
    )->addCacheContexts(['user.roles']);
  }
}
```

```yaml
# my_module.services.yml
services:
  my_module.access_checker:
    class: Drupal\my_module\Access\MyAccessChecker
    arguments: ['@config.factory']
    tags:
      - { name: access_check, applies_to: _my_module_access_check }
```

```yaml
# Route requirement
requirements:
  _my_module_access_check: 'TRUE'
```

## Route Alteration (Event Subscriber)

```php
use Drupal\Core\Routing\RouteSubscriberBase;
use Symfony\Component\Routing\RouteCollection;

class MyRouteSubscriber extends RouteSubscriberBase {
  protected function alterRoutes(RouteCollection $collection): void {
    // Disable user registration
    if ($route = $collection->get('user.register')) {
      $route->setRequirement('_access', 'FALSE');
    }
    // Change a permission requirement
    if ($route = $collection->get('some.route')) {
      $route->setRequirement('_permission', 'my permission');
    }
  }
}
```

Service: `tags: [{name: event_subscriber}]`

## Programmatic Access Check

```php
// Check if a URL is accessible
$url = \Drupal\Core\Url::fromRoute('my_module.hello');
if ($url->access()) {
  // render link
}

// Check with specific account
$url->access($account);

// Named route access via service
$access = \Drupal::service('access_manager')
  ->checkNamedRoute('my_module.hello', [], $account);
```

## AccessResult Best Practices

```php
use Drupal\Core\Access\AccessResult;

// Prefer these helpers:
AccessResult::allowed()
AccessResult::forbidden('Human-readable reason for developers')
AccessResult::neutral()               // "I don't know" — let others decide
AccessResult::allowedIf($condition)   // allowed if true, neutral if false
AccessResult::forbiddenIf($condition) // forbidden if true, neutral if false
AccessResult::allowedIfHasPermission($account, 'my permission')

// Combining
$result = AccessResult::allowedIfHasPermission($account, 'a')
  ->orIf(AccessResult::allowedIfHasPermission($account, 'b'));  // either

$result = AccessResult::allowedIfHasPermission($account, 'a')
  ->andIf(AccessResult::allowedIfHasPermission($account, 'b')); // both

// Add cache metadata to access results
$access = AccessResult::allowed();
$access->addCacheableDependency($config);        // adds config's tags
$access->addCacheContexts(['user.roles']);
$access->setCacheMaxAge(0);                      // uncacheable
```

**Rules:**
- Return `neutral()` rather than `forbidden()` from access handlers when your module doesn't have an opinion. Other modules may grant access.
- Always add appropriate cache contexts to access results — missing contexts cause incorrect caching (e.g., all users see the same access result).

## Redirects

### From an Event Subscriber

```php
use Symfony\Component\HttpFoundation\RedirectResponse;
use Drupal\Core\Routing\TrustedRedirectResponse;
use Drupal\Core\Url;

// Redirect within the site (cached)
$url = Url::fromRoute('entity.node.canonical', ['node' => 42]);
$response = new CacheableRedirectResponse($url->toString());
$cache = new CacheableMetadata();
$cache->addCacheContexts(['user.roles', 'route']);
$response->addCacheableDependency($cache);
$event->setResponse($response);

// External redirect
$response = new TrustedRedirectResponse('https://example.com');
```

### From a Form submit

```php
$form_state->setRedirectUrl(Url::fromRoute('entity.node.canonical', ['node' => $node->id()]));
```

### From a Controller

```php
return $this->redirect('entity.node.canonical', ['node' => $node->id()]);
```

## Entity Parameter Upcasting

Adding `type: entity:node` to route options replaces the raw integer in the URL with the loaded entity object:

```yaml
options:
  parameters:
    node:
      type: entity:node
```

The controller then receives `NodeInterface $node` instead of the integer ID.

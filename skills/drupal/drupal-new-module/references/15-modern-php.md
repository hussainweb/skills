# Modern PHP (8.1–8.5) in Drupal 11

Drupal 11 requires PHP 8.4 minimum. PHP 8.5 is recommended. Use modern PHP features consistently — they are not optional style preferences, they are the current coding standard in Drupal core and contrib.

---

## Constructor Property Promotion (PHP 8.0+)

**The standard pattern for all injectable classes in Drupal 11.** Eliminates separate property declarations and `$this->x = $x` boilerplate.

```php
// OLD — Drupal 8/9 style (do not write new code this way)
class MyService {
  protected EntityTypeManagerInterface $entityTypeManager;
  protected ConfigFactoryInterface $configFactory;

  public function __construct(
    EntityTypeManagerInterface $entityTypeManager,
    ConfigFactoryInterface $configFactory,
  ) {
    $this->entityTypeManager = $entityTypeManager;
    $this->configFactory = $configFactory;
  }
}

// NEW — Drupal 11 standard
class MyService {
  public function __construct(
    private readonly EntityTypeManagerInterface $entityTypeManager,
    private readonly ConfigFactoryInterface $configFactory,
  ) {}
}
```

Use `private readonly` for services injected into services.
Use `protected readonly` when subclasses need access.

---

## Readonly Properties (PHP 8.1) and Readonly Classes (PHP 8.2)

All plugin attribute classes in Drupal core use `readonly` extensively. Use it in your own value objects and data transfer objects.

```php
// PHP 8.1: individual readonly properties
class ImportResult {
  public function __construct(
    public readonly int $imported,
    public readonly int $skipped,
    public readonly int $failed,
  ) {}
}

// PHP 8.2: readonly class (all properties implicitly readonly)
readonly class NodeData {
  public function __construct(
    public string $title,
    public int $nid,
    public bool $published,
  ) {}
}
```

---

## PHP Native Attributes (PHP 8.0+)

Used for **all plugin discovery** and **hook registration** in Drupal 11. See [03-plugins.md](03-plugins.md) and [14-oop-hooks.md](14-oop-hooks.md) for full examples.

```php
// Plugin attribute
#[Block(
  id: 'my_block',
  admin_label: new TranslatableMarkup('My Block'),
)]
class MyBlock extends BlockBase {}

// Hook attribute
#[Hook('node_presave')]
public function nodePresave(NodeInterface $node): void {}

// PHPUnit test attributes
#[CoversClass(MyService::class)]
#[Group('my_module')]
class MyServiceTest extends UnitTestCase {}

// PHPUnit data provider
#[DataProvider('provideTestCases')]
public function testSomething(string $input, bool $expected): void {}
public static function provideTestCases(): array { return [...]; }
```

---

## Enums (PHP 8.1)

### Backed Enums for List Field Allowed Values

```php
// src/Enum/ArticleStatus.php
enum ArticleStatus: string {
  case Published = 'published';
  case Draft     = 'draft';
  case Archived  = 'archived';
}

// In baseFieldDefinitions():
$fields['article_status'] = BaseFieldDefinition::create('list_string')
  ->setSetting('allowed_values_enum', ArticleStatus::class);
```

### Enums for Internal Constants (replaces class constants)

```php
// Before PHP 8.1 — class with constants
final class Priority {
  const HIGH   = 'high';
  const NORMAL = 'normal';
  const LOW    = 'low';
}

// PHP 8.1 — backed enum (type-safe, IDE-supported, can use in match)
enum Priority: string {
  case High   = 'high';
  case Normal = 'normal';
  case Low    = 'low';
}

// Usage
$priority = Priority::High;
match($priority) {
  Priority::High   => $this->processImmediately($item),
  Priority::Normal => $queue->createItem($item),
  Priority::Low    => $this->deferUntilCron($item),
};
```

---

## Named Arguments (PHP 8.0+)

Named arguments improve readability for methods with many optional parameters:

```php
// Positional (hard to read which param is which)
new TranslatableMarkup('%count items', ['%count' => $count], ['context' => 'plural']);

// Named (clear)
new TranslatableMarkup(
  string: '%count items',
  arguments: ['%count' => $count],
  options: ['context' => 'plural'],
);

// Skipping optional parameters
$this->database->select('node', 'n')
  ->orderBy(field: 'created', direction: 'DESC')
  ->range(start: 0, length: 10);
```

---

## Union Types and Intersection Types (PHP 8.0/8.1)

```php
// Union type — accepts either type
public function setDescription(TranslatableMarkup|string|null $description): void {}

// Intersection type (PHP 8.1) — must satisfy both
public function process(Iterator&Countable $collection): void {}

// DNF types (PHP 8.2) — nullable intersection
public function handle((Iterator&Countable)|null $items): void {}

// Null-safe operator (PHP 8.0) — replaces isset chains
$langcode = $entity?->language()?->getId() ?? 'en';
```

---

## Match Expression (PHP 8.0+)

Preferred over `switch` for value-based dispatch. No fall-through, no `break`, throws `UnhandledMatchError` if no case matches.

```php
// Old switch
switch ($op) {
  case 'view':
    return AccessResult::allowedIfHasPermission($account, 'view products');
  case 'update':
    return AccessResult::allowedIfHasPermission($account, 'edit products');
  default:
    return AccessResult::neutral();
}

// Modern match
return match($op) {
  'view'   => AccessResult::allowedIfHasPermission($account, 'view products'),
  'update' => AccessResult::allowedIfHasPermission($account, 'edit products'),
  'delete' => AccessResult::allowedIfHasPermission($account, 'delete products'),
  default  => AccessResult::neutral(),
};
```

---

## First-Class Callables (PHP 8.1+)

```php
// Old closure syntax
array_map(function ($item) { return $this->process($item); }, $items);
array_filter($nodes, function ($node) { return $node->isPublished(); });

// First-class callable syntax
array_map($this->process(...), $items);
array_filter($nodes, $node->isPublished(...));

// In hook implementations and callbacks
$form['#submit'][] = $this->submitHandler(...);
$form['#validate'][] = $this->validate(...);
```

---

## PHP 8.4: New Array Functions

Drupal 11.1+ recommends PHP 8.4. These functions replace verbose `array_filter` + `array_values` patterns:

```php
// array_find — first element matching predicate (returns element, not key)
$published = array_find($nodes, fn($node) => $node->isPublished());
// Previously: foreach loop or reset(array_filter(...))

// array_find_key — key of first matching element
$key = array_find_key($items, fn($item) => $item['weight'] > 10);

// array_any — true if at least one matches
$hasPublished = array_any($nodes, fn($node) => $node->isPublished());
// Previously: !empty(array_filter(...))

// array_all — true if all match
$allPublished = array_all($nodes, fn($node) => $node->isPublished());
// Previously: count(array_filter(...)) === count($nodes)
```

---

## PHP 8.4: Property Hooks

Property hooks allow computed get/set logic on class properties without wrapping in methods. Not yet used in Drupal core (as of 11.x) but supported in PHP 8.4 and relevant for custom entity or value object code:

```php
class Product {
  // Getter transforms stored value
  public string $title {
    get => ucwords($this->title);
    set => $this->title = trim($value);
  }

  // Computed / virtual property (no backing storage)
  public string $displayName {
    get => $this->firstName . ' ' . $this->lastName;
  }
}
```

---

## PHP 8.4: Asymmetric Visibility

Allows different visibility for read vs write without `readonly`:

```php
class EntityBase {
  // Publicly readable, settable only within this class and subclasses
  public protected(set) string $uuid;

  // Publicly readable, only settable within this class
  public private(set) int $id;
}
```

---

## PHP 8.5: `#[Deprecated]` Native Attribute

PHP 8.5 introduces a native `#[Deprecated]` attribute that replaces `@deprecated` PHPDoc tags with a machine-enforceable declaration. Using it causes PHP to emit `E_USER_DEPRECATED` automatically whenever the decorated symbol is called — no manual `trigger_error()` needed.

```php
use Deprecated;

class MyService {

  // Old: PHPDoc only — no runtime enforcement
  /** @deprecated Use processV2() instead. */
  public function process(string $id): void {}

  // PHP 8.5: runtime deprecation notice on every call
  #[Deprecated(
    message: 'Use processV2() instead.',
    since: '2.0',
  )]
  public function process(string $id): void {
    $this->processV2($id);
  }

  public function processV2(string $id): void {}
}
```

Use `#[Deprecated]` on any method, function, class, or constant you are phasing out. Combine with a `@deprecated` PHPDoc tag for IDE tooltips — they are complementary:

```php
/**
 * @deprecated since 2.0, use MyNewService::handle() instead.
 */
#[Deprecated(message: 'Use MyNewService::handle() instead.', since: '2.0')]
public function legacyHandle(): void {}
```

---

## PHP 8.5: `array_first()` and `array_last()`

Retrieves the first or last element of an array without resetting the internal array pointer (unlike `reset()`/`end()`):

```php
// PHP 8.5 — no side effects on the original array
$first = array_first($nodes);   // equivalent to reset($nodes) but non-destructive
$last  = array_last($nodes);    // equivalent to end($nodes) but non-destructive

// Common Drupal pattern: get the first result from an entity query
$ids    = $storage->getQuery()->condition('status', 1)->range(0, 1)->execute();
$entity = $storage->load(array_first($ids));

// Previously required:
$entity = $storage->load(reset($ids));  // reset() moves internal pointer — avoid
```

---

## Fibers (PHP 8.1) — Drupal Internal

Drupal 11.3 uses PHP Fibers inside the render pipeline (BigPipe) to process placeholders concurrently, yielding a 31–62% reduction in DB queries on cold cache. This is internal to core — custom code does not need to use Fibers directly, but **enabling BigPipe on your site will automatically benefit** from this improvement.

---

## Type Declaration Completeness (Drupal 11 Standard)

Drupal 11 and its coding standards expect full type declarations on all new code:

```php
// All parameters, return types, and properties typed
class MyService {
  public function process(
    int $id,
    string $label,
    ?AccountInterface $account = NULL,
  ): array {
    // ...
    return [];
  }
}

// Never type as mixed when a more specific type is possible
// Use void for methods that return nothing
public function save(): void {}

// Use never for methods that always throw or exit
public function fail(): never {
  throw new \RuntimeException('Always fails');
}
```

---

## Quick Reference: When to Use What

| Need | Use |
|---|---|
| Injecting services into a class | Constructor property promotion + `readonly` |
| Plugin metadata | PHP `#[Attribute]` classes (not Doctrine `@Annotation`) |
| Hook implementations | `#[Hook]` in `src/Hook/` classes |
| Fixed set of allowed values | PHP `enum` |
| Simple branching on a value | `match` expression |
| Multiple optional args | Named arguments |
| Transform an array | `array_map($this->fn(...), $items)` with first-class callable |
| Find first match in array | `array_find()` (PHP 8.4) |
| First/last element of array | `array_first()` / `array_last()` (PHP 8.5) |
| Mark symbol as deprecated | `#[Deprecated(...)]` attribute (PHP 8.5) |
| Value object / DTO | `readonly class` (PHP 8.2) |
| Testing coverage annotation | `#[CoversClass(...)]` attribute (PHPUnit 11) |

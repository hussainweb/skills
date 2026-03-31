# Preprocess Functions and Template Suggestions

## What Preprocess Is For

Preprocess functions (`THEMENAME_preprocess_HOOKNAME()`) add or modify variables available in Twig templates. Their job is display logic — transforming data into a form Twig can use — not business logic.

**Wrong use of preprocess:**
- Fetching entities from the database and applying business rules
- Sending emails or triggering side effects
- Performing access control decisions

**Right use of preprocess:**
- Formatting dates for display
- Combining fields into a convenient variable
- Passing `drupalSettings` to JavaScript
- Exposing a block content entity to its template

## Preprocess Function Patterns

```php
// In THEMENAME.theme

// Add a variable to all node templates
function mytheme_preprocess_node(array &$variables): void {
  $node = $variables['node'];
  // Only add display variables, not business logic
  $variables['display_date'] = \Drupal::service('date.formatter')
    ->format($node->getCreatedTime(), 'medium');
}

// Add a variable to a specific region
function mytheme_preprocess_region(array &$variables): void {
  if ($variables['region'] === 'footer') {
    $variables['site_name'] = \Drupal::config('system.site')->get('name');
    $variables['copyright'] = theme_get_setting('copyright');
  }
}

// Expose a block content entity to the block template
function mytheme_preprocess_block(array &$variables): void {
  if (isset($variables['elements']['content']['#block_content'])) {
    $variables['block_content'] =
      $variables['elements']['content']['#block_content'];
  }
}

// Pass data to JavaScript via drupalSettings
function mytheme_preprocess_page(array &$variables): void {
  $variables['#attached']['drupalSettings']['mytheme']['apiBase'] =
    \Drupal::request()->getBaseUrl();
}
```

## Common Preprocess Mistakes

**Static calls inside service classes** — acceptable in `.theme` (which is procedural), but avoid in any class:
```php
// OK in mytheme.theme (procedural context)
\Drupal::config('system.site')->get('name');

// WRONG in a service class or block class
class MyBlock extends BlockBase {
  public function build(): array {
    $name = \Drupal::config('system.site')->get('name'); // use injection instead
  }
}
```

**Long preprocess functions** — if a preprocess function exceeds ~20 lines or contains complex entity logic, extract to a bundle class (Drupal 10.3+) or a dedicated service.

**Missing specificity** — always use the most specific hook available:
```php
// PREFER — runs only for article nodes
function mytheme_preprocess_node__article(array &$variables): void { ... }

// AVOID — runs for all nodes, requires a bundle check inside
function mytheme_preprocess_node(array &$variables): void {
  if ($variables['node']->bundle() === 'article') { ... }
}
```

## Template Suggestion Hooks

```php
// Pattern: THEMENAME_theme_suggestions_HOOKNAME_alter()

// Add suggestion based on block content bundle
function mytheme_theme_suggestions_block_alter(
  array &$suggestions,
  array $variables,
): void {
  if (isset($variables['elements']['content']['#block_content'])) {
    $bundle = $variables['elements']['content']['#block_content']->bundle();
    $suggestions[] = 'block__' . $bundle;
  }
}

// Add suggestion based on current path
function mytheme_theme_suggestions_region_alter(
  array &$suggestions,
  array $variables,
): void {
  if (\Drupal::service('path.matcher')->isFrontPage()) {
    $suggestions[] = 'region__' . $variables['elements']['#region'] . '__front';
  }
}

// Add suggestion to page template based on node bundle
function mytheme_theme_suggestions_page_alter(
  array &$suggestions,
  array $variables,
): void {
  $node = \Drupal::routeMatch()->getParameter('node');
  if ($node instanceof NodeInterface) {
    $suggestions[] = 'page__' . $node->bundle();
  }
}
```

## Cache Metadata in Preprocess

When you add a variable based on data that can change, you must also declare the cache dependency. Otherwise Drupal caches the page and never refreshes the variable.

```php
function mytheme_preprocess_block(array &$variables): void {
  $config = \Drupal::config('system.site');
  $variables['site_name'] = $config->get('name');

  // Declare that this output depends on this config object
  \Drupal\Core\Cache\CacheableMetadata::createFromObject($config)
    ->applyTo($variables);
}
```

Without `applyTo()`, if `system.site` changes, the block stays stale until the cache is manually cleared.

## Using Bundle Classes (Drupal 10.3+)

For complex entity-specific logic, use bundle classes rather than long preprocess functions:

```php
// src/Entity/Article.php
#[ContentEntityType(
  id: 'node',
  bundle: 'article',
  ...
)]
class Article extends Node {
  public function getReadingTime(): int {
    $words = str_word_count($this->get('body')->value);
    return (int) ceil($words / 200);
  }
}
```

```twig
{# node--article.html.twig #}
{{ node.readingTime }} min read
```

This keeps preprocess functions thin and makes entity-specific methods reusable across the theme and modules.

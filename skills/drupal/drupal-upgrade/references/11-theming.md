# Theme Development

## Theme File Structure

```
mytheme/
├── mytheme.info.yml              # Required: metadata, regions, libraries, base theme
├── mytheme.libraries.yml         # CSS/JS asset library definitions
├── mytheme.theme                 # PHP hooks (preprocess, suggestions, hook_theme)
├── mytheme.breakpoints.yml       # Responsive breakpoint definitions
├── theme-settings.php            # Custom theme settings form additions
├── config/
│   ├── install/mytheme.settings.yml   # Default theme setting values
│   └── schema/mytheme.schema.yml      # Schema for theme settings
├── templates/
│   ├── layout/         # html.html.twig, page.html.twig, region.html.twig
│   ├── block/          # block.html.twig, block--TYPE.html.twig
│   ├── content/        # node.html.twig, node--TYPE.html.twig
│   ├── field/          # field.html.twig, field--NAME.html.twig
│   ├── views/          # views-view.html.twig, etc.
│   └── navigation/     # menu.html.twig
├── css/                # Source CSS/SCSS
├── js/                 # JavaScript files
├── build/              # Compiled assets (committed or gitignored based on setup)
└── components/         # Single Directory Components (SDC, Drupal 10.1+)
    └── my-component/
        ├── my-component.component.yml
        ├── my-component.html.twig
        ├── my-component.css
        └── my-component.js
```

## theme.info.yml

```yaml
name: My Theme
type: theme
base theme: starterkit_theme
core_version_requirement: ^10
description: 'My custom theme'
package: Custom

regions:
  header: Header
  breadcrumb: Breadcrumb
  help: Help
  content: Content
  sidebar: Sidebar
  footer: Footer
  page_top: 'Page top'
  page_bottom: 'Page bottom'

libraries:
  - mytheme/base
  - mytheme/main

ckeditor5-stylesheets:
  - build/main.css

libraries-override:
  core/normalize: false   # disable a core library
  core/modernizr: false

libraries-extend:
  user/drupal.user:
    - mytheme/user-styles   # load mytheme/user-styles whenever user/drupal.user loads
```

**Generating from Starterkit:**
```bash
php core/scripts/drupal generate-theme mytheme --path themes/custom
```

## theme.libraries.yml

```yaml
base:
  version: VERSION
  css:
    base:
      css/reset.css: {}
    layout:
      build/layout.css: {}
    theme:
      build/theme.css: {}
  js:
    build/theme.js: {}
  dependencies:
    - core/drupal
    - core/once

swiper:
  remote: https://swiperjs.com
  version: 6.8.4
  license:
    name: MIT
    url: https://github.com/nolimits4web/swiper/blob/master/LICENSE
    gpl-compatible: true
  js:
    https://unpkg.com/swiper@6.8.4/swiper-bundle.min.js:
      { type: external, minified: true }
  css:
    component:
      https://unpkg.com/swiper@6.8.4/swiper-bundle.min.css:
        { type: external, minified: true }
```

### CSS SMACSS Categories (order matters for specificity)

| Key | Purpose |
|---|---|
| `base` | Reset/normalize rules, element defaults |
| `layout` | Page structure, grids |
| `component` | Reusable UI components |
| `state` | `.is-active`, `.is-hidden`, etc. |
| `theme` | Visual overrides |

### JS Placement Options

```yaml
js:
  js/my-script.js:
    scope: footer    # default — load before </body>
    # scope: header  # load in <head> (use only when necessary)
    weight: -10
    attributes:
      defer: true
```

## Twig Templating

### Enable Debug Mode

In `sites/default/services.yml` (development only):

```yaml
parameters:
  twig.config:
    debug: true
    auto_reload: true
    cache: false
```

With debug enabled, HTML comments show available template suggestions:

```html
<!-- THEME HOOK: 'node' -->
<!-- FILE NAME SUGGESTIONS:
   * node--article--full.html.twig
   * node--article.html.twig
   * node--full.html.twig
   x node.html.twig          ← active template
-->
```

### Template Naming Convention

| Suggestion | Filename |
|---|---|
| `block` | `block.html.twig` |
| `block__system` | `block--system.html.twig` |
| `block__system_branding_block` | `block--system-branding-block.html.twig` |
| `node__article__teaser` | `node--article--teaser.html.twig` |
| `field__field_image__article` | `field--field-image--article.html.twig` |
| `views_view__my_view__page_1` | `views-view--my-view--page-1.html.twig` |

**Rule:** Underscores in PHP hook names become hyphens in filenames. Double underscores become double hyphens.

### Template Override Process

1. Enable Twig debug mode
2. Load the page and inspect HTML source comments
3. Copy the active template from its current location into `themes/custom/mytheme/templates/`
4. Rename with the more-specific suggestion you want to match
5. Clear cache: `drush cr`

### Adding Custom Template Suggestions

```php
// In mytheme.theme
function mytheme_theme_suggestions_block_alter(
  array &$suggestions,
  array $variables,
): void {
  // Add a suggestion based on block content bundle
  if (isset($variables['elements']['content']['#block_content'])) {
    $bundle = $variables['elements']['content']['#block_content']->bundle();
    $suggestions[] = 'block__' . $bundle;
  }
}

function mytheme_theme_suggestions_region_alter(
  array &$suggestions,
  array $variables,
): void {
  if (\Drupal::service('path.matcher')->isFrontPage()) {
    $suggestions[] = 'region__' . $variables['elements']['#region'] . '__front';
  }
}
```

Function name: `THEMENAME_theme_suggestions_HOOKNAME_alter()`.

## Preprocess Functions

```php
// In mytheme.theme

// Add variables to all node templates
function mytheme_preprocess_node(array &$variables): void {
  $node = $variables['node'];
  if ($node instanceof Trip) {
    $variables['destination'] = $node->get('field_destination')->value;
  }
}

// Add variables to a specific region
function mytheme_preprocess_region(array &$variables): void {
  if ($variables['region'] === 'footer') {
    $variables['site_name'] = \Drupal::config('system.site')->get('name');
    $variables['copyright'] = theme_get_setting('copyright');
  }
}

// Inject block content entity into block template
function mytheme_preprocess_block(array &$variables): void {
  if (isset($variables['elements']['content']['#block_content'])) {
    $variables['block_content'] =
      $variables['elements']['content']['#block_content'];
  }
}

// Pass drupalSettings from preprocess
function mytheme_preprocess_page(array &$variables): void {
  $variables['#attached']['drupalSettings']['mytheme']['copyright'] =
    theme_get_setting('copyright');
}
```

**Rules:**
- Preprocess functions add display-specific variables — not business logic.
- Use bundle classes for complex entity-specific logic instead of long preprocess functions.
- Preprocess is per-hook; always use the most specific hook available.

## Drupal-Specific Twig Functions and Filters

```twig
{# Functions #}
{{ attach_library('mytheme/swiper') }}
{{ path('entity.node.canonical', {node: node.id()}) }}
{{ url('user.login') }}
{{ link('Click here', url) }}
{{ file_url(file.uri.value) }}
{{ drupal_block('system_branding_block') }}
{{ drupal_menu('main') }}
{{ drupal_view('frontpage', 'block_1') }}
{{ drupal_config('system.site', 'name') }}
{{ drupal_entity('node', 42) }}

{# Filters #}
{{ label|t }}
{{ label|trans }}
{{ content|without('field_image', 'field_tags') }}
{{ class|clean_class }}
{{ id|clean_id }}
{{ timestamp|format_date('short') }}
{{ file_uri|image_style('thumbnail') }}
{{ render_array|render }}
{{ items|safe_join(', ') }}
```

### The `|without` Filter (Critical for Cache)

```twig
{# Output specific fields #}
{{ content.field_title }}
{{ content.field_image }}

{# Output everything except certain fields — PRESERVES cache metadata #}
{{ content|without('field_image', 'field_tags') }}
```

Using `|without` ensures that cache tags and contexts from excluded fields still bubble up to the parent — never manually pick fields by omission if you need correct caching.

## JavaScript Behaviors

**Never use `$(document).ready()` or `window.onload`.** Always use `Drupal.behaviors`:

```javascript
// With jQuery
(function ($, Drupal, once) {
  'use strict';
  Drupal.behaviors.myThemeBehavior = {
    attach: function (context, settings) {
      once('my-behavior', '.my-element', context).forEach(function (element) {
        $(element).on('click', function () {
          console.log(settings.mytheme.message);
        });
      });
    }
  };
}(jQuery, Drupal, once));

// Without jQuery
(function (Drupal, once) {
  'use strict';
  Drupal.behaviors.myThemeBehavior = {
    attach(context, settings) {
      once('my-behavior', '.my-element', context).forEach((element) => {
        element.addEventListener('click', () => {
          Drupal.announce(Drupal.t('Item selected'));
        });
      });
    }
  };
})(Drupal, once);
```

**Why `once()`:** `attach()` is called on initial page load AND after every AJAX response. `once()` ensures event listeners are attached only once per element.

### Passing Data from PHP to JavaScript

```php
// In a render array or preprocess:
$build['#attached']['drupalSettings']['mytheme']['message'] = 'Hello';
```

```javascript
// In Drupal.behaviors:
settings.mytheme.message  // 'Hello'
```

### Required Library Dependencies for JS

```yaml
my-js-library:
  js:
    js/my-script.js: {}
  dependencies:
    - core/drupal      # REQUIRED for Drupal.behaviors
    - core/jquery      # if using $
    - core/once        # REQUIRED for once()
    - core/drupal.ajax # if using AJAX commands
```

## Single Directory Components (SDC) — Drupal 10.1+

```yaml
# components/my-button/my-button.component.yml
'$schema': 'https://git.drupalcode.org/project/drupal/-/raw/10.1.x/core/modules/sdc/src/metadata.schema.json'
name: "My Button"
status: "stable"
props:
  type: object
  properties:
    label:
      type: string
      title: "Label"
    variant:
      type: string
      examples: ["primary", "secondary"]
required:
  - label
  - variant
```

```twig
{# components/my-button/my-button.html.twig #}
<div {{ attributes.addClass('my-button') }}>
  <button class="btn btn--{{ variant }}">{{ label }}</button>
</div>
```

```twig
{# Using in another template — with_context = false prevents variable leaking #}
{{ include('mytheme:my-button', {
  'label': 'Click me',
  'variant': 'primary'
}, with_context = false) }}
```

**Override a module's SDC from a theme:**

```yaml
# themes/custom/mytheme/components/my-button/my-button.component.yml
replaces: 'my_module:my-button'
```

## Responsive Images

### 1. Define breakpoints (`mytheme.breakpoints.yml`)

```yaml
mytheme.mobile:
  label: Mobile
  mediaQuery: 'all and (min-width: 0px)'
  weight: 0
  multipliers: ['1x']

mytheme.md:
  label: Medium
  mediaQuery: 'all and (min-width: 768px)'
  weight: 2
  multipliers: ['1x']

mytheme.lg:
  label: Large
  mediaQuery: 'all and (min-width: 1024px)'
  weight: 3
  multipliers: ['1x', '2x']
```

### 2. Create image styles per breakpoint at `/admin/config/media/image-styles`

### 3. Create a responsive image style at `/admin/config/media/responsive-image-style` mapping breakpoints to styles

### 4. Use the "Responsive image" formatter in field display settings

## Accessibility

```twig
{# aria-live for dynamic content updates #}
<div aria-live="polite">{{ dynamic_content }}</div>

{# Skip link target #}
<a id="main-content" tabindex="-1"></a>

{# Visually hidden but accessible to screen readers #}
<span class="visually-hidden">{{ 'More about %title'|t({'%title': node.title.value}) }}</span>
```

```javascript
// Polite announcement (waits for user to be idle)
Drupal.announce(Drupal.t('Item added to cart'));

// Assertive (interrupts screen reader)
Drupal.announce(Drupal.t('Form error: email required'), 'assertive');
```

## Theme Settings

```php
// theme-settings.php
function mytheme_form_system_theme_settings_alter(
  array &$form,
  FormStateInterface $form_state,
): void {
  $form['mytheme_settings']['copyright'] = [
    '#type'          => 'textfield',
    '#title'         => t('Copyright text'),
    '#default_value' => theme_get_setting('copyright'),
    '#required'      => TRUE,
  ];
}
```

```yaml
# config/install/mytheme.settings.yml
copyright: '© 2024 My Company'
```

```yaml
# config/schema/mytheme.schema.yml
mytheme.settings:
  type: theme_settings
  label: 'My Theme settings'
  mapping:
    copyright:
      type: string
      label: 'Copyright text'
```

Reading theme settings in PHP: `theme_get_setting('copyright')`.

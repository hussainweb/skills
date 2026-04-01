# Theme Configuration (info.yml, theme-settings, breakpoints)

## theme.info.yml — Required Fields

```yaml
name: My Theme
type: theme
base theme: starterkit_theme    # or classy / stable9 / false (no base theme)
core_version_requirement: ^10 || ^11
description: 'Custom theme for Example project'
package: Custom

regions:
  header: Header
  breadcrumb: Breadcrumb
  help: Help
  content: Content        # REQUIRED — blocks that fill "main content" go here
  sidebar_first: 'Sidebar first'
  footer: Footer
  page_top: 'Page top'   # used by toolbar, messages; typically hidden from editors
  page_bottom: 'Page bottom'

libraries:
  - mytheme/base           # attach these to every page

ckeditor5-stylesheets:
  - build/editor.css       # styles loaded in the CKEditor 5 editing frame
```

### Base Theme Guidance

| Base theme | When to use |
|---|---|
| `starterkit_theme` | New themes — recommended starting point for Drupal 10+ |
| `stable9` | Minimal stable base; use when you want full control |
| `classy` | Legacy; avoid for new themes |
| `false` | Standalone with no base theme — rare, requires defining all templates yourself |

Generate from starterkit:
```bash
php core/scripts/drupal generate-theme mytheme --path themes/custom
```

### libraries-override and libraries-extend

```yaml
# Disable core libraries you're replacing entirely
libraries-override:
  core/normalize: false
  core/modernizr: false

# Replace a specific file within a library
libraries-override:
  bartik/base:
    css:
      theme:
        css/base/elements.css: css/my-elements.css

# Attach your library whenever another library loads (for targeted style overrides)
libraries-extend:
  user/drupal.user:
    - mytheme/user-styles
  core/drupal.dialog:
    - mytheme/dialog-overrides
```

`libraries-extend` is cleaner than global CSS for overriding contrib module styles — it only loads when needed.

## Theme Settings

### theme-settings.php

```php
function mytheme_form_system_theme_settings_alter(
  array &$form,
  FormStateInterface $form_state,
): void {
  $form['mytheme_settings'] = [
    '#type'  => 'details',
    '#title' => t('My Theme Settings'),
    '#open'  => TRUE,
  ];
  $form['mytheme_settings']['copyright'] = [
    '#type'          => 'textfield',
    '#title'         => t('Copyright text'),
    '#default_value' => theme_get_setting('copyright'),
    '#required'      => TRUE,
  ];
  $form['mytheme_settings']['show_breadcrumb'] = [
    '#type'          => 'checkbox',
    '#title'         => t('Show breadcrumb'),
    '#default_value' => theme_get_setting('show_breadcrumb') ?? TRUE,
  ];
}
```

### config/install/mytheme.settings.yml

Default values for all custom settings — installed when the theme is enabled:

```yaml
copyright: '© 2025 My Company'
show_breadcrumb: true
logo_path: ''
```

### config/schema/mytheme.schema.yml

Schema is required for config to pass validation and be exportable:

```yaml
mytheme.settings:
  type: theme_settings
  label: 'My Theme settings'
  mapping:
    copyright:
      type: string
      label: 'Copyright text'
    show_breadcrumb:
      type: boolean
      label: 'Show breadcrumb on all pages'
    logo_path:
      type: string
      label: 'Custom logo path'
```

Missing schema means `drush config:export` will warn about unknown config keys, and the Drupal status page may flag validation errors.

### Reading theme settings

```php
// In preprocess or theme functions
$copyright = theme_get_setting('copyright');
$show_breadcrumb = (bool) theme_get_setting('show_breadcrumb');
```

## Breakpoints (mytheme.breakpoints.yml)

```yaml
mytheme.mobile:
  label: Mobile
  mediaQuery: 'all and (min-width: 0px)'
  weight: 0
  multipliers: ['1x']

mytheme.sm:
  label: Small
  mediaQuery: 'all and (min-width: 576px)'
  weight: 1
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

mytheme.xl:
  label: Extra Large
  mediaQuery: 'all and (min-width: 1280px)'
  weight: 4
  multipliers: ['1x', '2x']
```

Breakpoints defined here appear in the responsive image style UI at `/admin/config/media/responsive-image-style`. The `multipliers` array enables HiDPI (retina) image styles.

**Rules:**
- Order by weight ascending (smallest screen first)
- Use `min-width` (mobile-first)
- `multipliers: ['1x', '2x']` for breakpoints where HiDPI images are worth the cost (typically `lg` and above)

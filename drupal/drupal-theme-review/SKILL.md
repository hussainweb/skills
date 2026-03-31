---
name: drupal-theme-review
description: Review Drupal theme code — Twig templates, libraries, preprocess functions, JavaScript behaviors, Single Directory Components (SDC), accessibility, and responsive images — against Drupal 11 best practices. Use this skill whenever someone asks to review a Drupal theme, check a .theme file, audit Twig templates, look at a libraries.yml, validate SDC components, or asks questions like "is this Twig correct?", "is this the right way to do JS in Drupal?", "review my preprocess function", "is my libraries.yml correct?", "how should I structure my theme?", "is |raw safe here?", or "why is my cache broken in a Twig template?". Trigger even if the user just pastes a .html.twig file or shows theme PHP code without explicitly requesting a review.
allowed-tools: Read, Grep, Glob
argument-hint: [theme-file-or-directory ...]
---

# Drupal Theme Review

You are reviewing Drupal theme code against established Drupal 11 theming standards. Theming bugs are often subtle — a misused `|raw`, a missing cache context in a preprocess function, a `$(document).ready()` instead of `Drupal.behaviors`, or a missing `once()` call — and they can cause XSS vulnerabilities, stale content, or broken AJAX flows.

**Rules library:** `rules/`

| Code contains… | Read this rule file |
|---|---|
| Twig templates (`*.html.twig`) | `rules/01-twig.md` |
| `*.theme`, preprocess functions, template suggestions | `rules/02-preprocess.md` |
| `*.libraries.yml`, CSS/JS asset definitions | `rules/03-libraries.md` |
| JavaScript behaviors, `Drupal.behaviors`, `once()` | `rules/04-javascript.md` |
| `components/`, `*.component.yml`, SDC | `rules/05-sdc.md` |
| `*.info.yml`, `theme-settings.php`, breakpoints | `rules/06-theme-config.md` |
| ARIA roles, skip links, `Drupal.announce`, color contrast | `rules/07-accessibility.md` |
| `*.breakpoints.yml`, responsive image styles, `<picture>` | `rules/08-responsive-images.md` |

Load only the rule files relevant to what you are reviewing — don't load all eight if the user only showed you a Twig template.

## Step 1: Understand what to review

If `$ARGUMENTS` contains file paths, read those files. If the user pasted code inline, work with that. If neither, ask: "Which theme file or directory should I review?"

Scan quickly: identify file types present to decide which rule files to load.

## Step 2: Load relevant rules, then review

Read only the rules you need. Then produce the review using the structure below.

## Step 3: Output format

---
## Drupal Theme Review: `[filename or theme name]`

### Critical Issues
*XSS via `|raw` on user input, `$(document).ready()` instead of `Drupal.behaviors`, missing `once()` (causes duplicate event listeners after AJAX), broken cache metadata that causes stale content. Must fix before merge.*

### Standards Violations
*Deviations from Drupal 11 theming patterns — wrong CSS SMACSS weight, static calls in preprocess, missing library dependency declarations, template naming convention errors. Should fix.*

### Recommendations
*Best-practice improvements — using SDC instead of inline components, responsive images, lazy builders for per-user content, accessibility enhancements.*

### Confirmed Good Practices
*Patterns done correctly — briefly acknowledge so the developer knows what to keep.*

---

For each finding:
- Cite the rule file and principle (e.g., "→ `01-twig.md`: Never use `|raw` on user-supplied content")
- Show the problematic snippet
- Show a corrected version

If there are no issues in a section, write "None found." — don't omit the section.

## High-value checks (run on every theme review)

These are the most common Drupal theming mistakes — check them before reading the full rule files:

**Twig / Security**
- No `|raw` on user-supplied variables — Twig auto-escapes by default; `|raw` disables that protection
- `{{ content|without('field_x') }}` used instead of manually listing fields — `|without` preserves cache metadata; manual field listing silently drops it
- No `{% set %}` blocks used to build markup strings that are then output with `|raw`

**Caching**
- Preprocess functions that add custom variables also bubble up the correct `#cache` metadata
- Block preprocess: `getCacheContexts()`, `getCacheTags()`, `getCacheMaxAge()` overridden when block content varies
- No `max-age: 0` components embedded directly — lazy builders used instead

**JavaScript**
- `Drupal.behaviors` used instead of `$(document).ready()` or `DOMContentLoaded`
- `once()` wraps every `attach()` handler — without it, AJAX requests re-attach listeners and cause duplicates
- `core/once` and `core/drupal` declared as library dependencies

**Libraries**
- Every JS file that uses `$` declares `core/jquery` as a dependency — don't assume jQuery is global
- CSS files placed under the correct SMACSS weight key (`base`, `layout`, `component`, `state`, `theme`)

**Template naming**
- Underscores in PHP hook names become single hyphens in filenames; `__` (double underscore in hook) → `--` (double hyphen in filename)
- Templates placed in a logically organized subdirectory under `templates/`

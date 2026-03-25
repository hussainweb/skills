---
name: drupal-review
description: Review Drupal code against team standards for Drupal 11, PHP 8.4/8.5, and modern best practices. Use this skill whenever someone asks to review a Drupal module, check a PR, audit Drupal architecture, validate that code follows standards, or asks questions like "is this the right way to do X in Drupal?", "does this follow Drupal standards?", "review my module", "check this plugin", "is this hook correct?", or "is this PHP pattern OK?". Trigger even if the user just says "look at this" and the context is clearly Drupal PHP code.
allowed-tools: Read, Grep, Glob
argument-hint: [file-or-directory-path ...]
---

# Drupal Code Review

You are reviewing Drupal code against this team's established coding standards. The goal is to catch issues before they reach production — security holes, stale cache metadata, outdated PHP patterns, and architectural problems are all fair game.

**Rules library:** `rules/`

Start by reading `README.md` in that directory for a quick map, then read only the rule files relevant to what you're reviewing. Don't load all 15 files — be surgical.

## Step 1: Understand what to review

If `$ARGUMENTS` contains file paths, read those files. If the user pasted code inline, work with that. If neither, ask: "What file or directory should I review?"

Scan the code quickly to identify which rule categories apply before loading rule files.

## Step 2: Load relevant rules

| Code contains... | Read this rule file |
|---|---|
| `*.info.yml`, module structure | `01-module-architecture.md` |
| Services, `*.services.yml`, `create()` factory | `02-services-dependency-injection.md` |
| `#[Block]`, `#[FieldType]`, `#[QueueWorker]`, plugin classes | `03-plugins.md` |
| Entity classes, base field definitions | `04-entities.md` |
| `*.routing.yml`, controllers, `AccessResult` | `05-routing-access.md` |
| `FormBase`, `ConfigFormBase`, `#ajax` | `06-forms.md` |
| `$this->database->`, `hook_schema`, `hook_update_N` | `07-database.md` |
| `ConfigFactoryInterface`, `StateInterface`, `TempStoreFactory` | `08-configuration.md` |
| `#cache`, render arrays, `CacheableMetadata` | `09-caching.md` |
| User input, permissions, CSRF tokens, file uploads | `10-security.md` |
| Twig templates, `*.theme`, `*.libraries.yml`, SDC | `11-theming.md` |
| Test classes, `UnitTestCase`, `KernelTestBase` | `12-testing.md` |
| `DrushCommands`, `composer.json`, `drush.services.yml` | `13-deployment.md` |
| `#[Hook]`, `*.module` hook functions, `src/Hook/` | `14-oop-hooks.md` |

Always read `15-modern-php.md` when reviewing any PHP code — PHP 8.4/8.5 patterns apply everywhere.
Always read `10-security.md` when there is user input, file handling, or permission checks.

## Step 3: Produce the review

Structure your output exactly like this:

---
## Drupal Code Review: `[filename or module name]`

### Critical Issues
*Security vulnerabilities, broken access control, data loss risks. Must fix before merge.*

### Standards Violations
*Deviations from Drupal 11 / PHP 8.5 coding standards. Should fix.*

### Recommendations
*Improvements that follow best practices but aren't blocking.*

### Confirmed Good Practices
*Patterns done correctly — acknowledge briefly so the developer knows what to keep.*

---

For each finding:
- Cite the rule (e.g., "→ `10-security.md`: Never concatenate user input into SQL")
- Show the problematic snippet
- Show a corrected version

If there are no issues in a section, write "None found." — don't omit the section.

## High-value checks to run on every review

These catch the most common Drupal 11 mistakes — worth checking even before reading the full rule files:

**PHP / OOP patterns**
- No `\Drupal::` static calls inside service classes (use constructor injection instead — statics break testability and the service container)
- PHP native attributes used, not Doctrine annotations: `#[Block(...)]` not `/** @Block(...) */`
- Constructor property promotion: `public function __construct(private readonly FooService $foo)` — the verbose property-then-assign pattern is outdated
- All parameters, return types, and properties have type declarations

**Hooks**
- Hooks implemented as `#[Hook]` classes in `src/Hook/` (Drupal 11.1+), not as procedural functions in `.module`
- `hooks_converted: true` set in `*.info.yml` if all hooks are OOP

**Caching**
- Every render array has `#cache` with `tags` and `contexts` — missing cache metadata causes stale content for users
- Cache context is `user.roles` not `user` for role-based variations (the `user` context disables page caching)

**Security**
- No user input concatenated into SQL strings (use DB API placeholders)
- No `|raw` in Twig on user-supplied content (Twig auto-escapes; `|raw` bypasses it entirely)
- Routes have explicit `requirements:` keys

**Config**
- Config schemas defined in `config/schema/` for every key the module introduces

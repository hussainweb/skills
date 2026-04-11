---
name: conventional-commits
description: Write commit messages following the Conventional Commits v1.0.0 specification. ALWAYS use this skill when creating git commits — whether via `git commit`, interactive rebase message editing, or any other commit workflow. Triggers on "commit", "git commit", "create a commit", "commit message", or any action that produces a git commit message.
allowed-tools: Bash, Read, Grep, Glob
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Conventional Commits

Write every commit message according to the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Undercover mode

**CRITICAL:** Do NOT add `Co-Authored-By`, `Signed-off-by`, or any other trailer that attributes or identifies an AI agent as a contributor. The commit must look like it was written entirely by the human developer. This applies to all footers — never reveal agent involvement.

## Commit message format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Rules

### Type (required)

The first element is the **type** — a noun that categorizes the change:

| Type       | When to use                                          | SemVer effect |
|------------|------------------------------------------------------|---------------|
| `feat`     | A new feature for the user or consumer               | MINOR         |
| `fix`      | A bug fix                                            | PATCH         |
| `docs`     | Documentation only                                   | -             |
| `style`    | Formatting, whitespace, semicolons — no logic change | -             |
| `refactor` | Code change that neither fixes a bug nor adds a feature | -          |
| `perf`     | Performance improvement                              | -             |
| `test`     | Adding or correcting tests                           | -             |
| `build`    | Changes to the build system or dependencies          | -             |
| `ci`       | CI configuration and scripts                         | -             |
| `chore`    | Other changes that don't modify src or test files    | -             |

Only `feat` and `fix` are mandated by the spec. The rest are widely adopted conventions. Pick the type that most accurately describes the change — do not default to `chore` when a more specific type applies.

### Scope (optional)

A noun in parentheses after the type describing the section of the codebase affected:

```
feat(auth): add OAuth2 login flow
fix(parser): handle empty input without crashing
```

Use scope when the repo is large enough that it helps orient the reader. Keep scopes consistent within a project — check `git log` for existing scopes before inventing new ones.

### Description (required)

- Immediately follows the colon and space after the type/scope prefix
- Use the imperative mood ("add", "fix", "remove" — not "added", "fixes", "removed")
- Do not capitalize the first letter
- Do not end with a period
- Keep it under 72 characters
- Summarize *what* the change does, not *how*

### Body (optional)

- Separated from the description by one blank line
- Free-form — can contain multiple paragraphs
- Use to explain *why* the change was made when the description alone is insufficient
- Wrap lines at 72 characters

### Footers (optional)

- Separated from the body (or description if no body) by one blank line
- Format: `token: value` or `token #value`
- Tokens use `-` instead of spaces (e.g., `Reviewed-by`, `Refs`)
- Exception: `BREAKING CHANGE` (must be uppercase, space allowed)

### Breaking changes

Indicate breaking changes in one of two ways (or both):

1. **`!` after type/scope:** `feat(api)!: remove deprecated endpoints`
2. **Footer:** `BREAKING CHANGE: the /v1 endpoints have been removed`

A `BREAKING CHANGE` footer MUST be uppercase. When present, it triggers a MAJOR version bump regardless of the type.

## Choosing the right type

Before writing the message, examine the staged changes:

1. **Does it add new user-facing behavior?** -> `feat`
2. **Does it fix incorrect behavior?** -> `fix`
3. **Does it only change documentation?** -> `docs`
4. **Does it only change tests?** -> `test`
5. **Does it improve performance without changing behavior?** -> `perf`
6. **Does it restructure code without changing behavior?** -> `refactor`
7. **Does it only change formatting/style?** -> `style`
8. **Does it change build tooling or dependencies?** -> `build`
9. **Does it change CI pipelines?** -> `ci`
10. **None of the above?** -> `chore`

If a commit spans multiple types, prefer the most significant one (usually `feat` or `fix`). If the changes are truly unrelated, consider splitting into separate commits.

## Workflow

When asked to commit, or when you determine a commit is needed:

1. Run `git diff --cached` (or `git diff` if nothing is staged) to understand what changed.
2. Run `git log --oneline -10` to see recent commit style and any existing scope conventions.
3. Classify the change using the type selection guide above.
4. Write the commit message following the format rules.
5. Use a HEREDOC to pass the message to `git commit` for correct formatting:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description

Optional body explaining why.

Optional-Footer: value
EOF
)"
```

## Examples

Simple feature:
```
feat: add email notifications for failed jobs
```

Bug fix with scope:
```
fix(css): correct button alignment on mobile viewports
```

Breaking change with `!` and footer:
```
feat(api)!: require authentication for all endpoints

All API endpoints now require a valid Bearer token.
Previously, read-only endpoints were publicly accessible.

BREAKING CHANGE: unauthenticated requests to any endpoint now return 401
```

Refactor with body:
```
refactor: extract validation logic into shared module

The same validation rules were duplicated across three controllers.
Moving them to a shared module reduces drift and makes the rules
easier to test in isolation.
```

Docs only:
```
docs: add contributing guidelines for new developers
```

Build change:
```
build(deps): upgrade webpack from 4 to 5
```

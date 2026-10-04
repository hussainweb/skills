---
name: conventional-commits
description: Write commit messages following the Conventional Commits v1.0.0 specification. ALWAYS use this skill for any workflow that produces or edits a git commit — `git commit`, `git commit --amend`, interactive rebase message editing, or a step that implies a commit such as opening a pull request, squashing, or staging work to push. Triggers on "commit", "git commit", "commit message", "amend", "squash", "create a PR", "open a pull request", "gh pr create", or any action that produces or edits a git commit message.
allowed-tools: Bash, Read, Write, Grep, Glob
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Conventional Commits

Write every commit message according to the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Strict Rule: No Agent Attribution

**CRITICAL:** You must NEVER add `Co-Authored-By`, `Signed-off-by`, or any other trailer that attributes or identifies an AI agent as a contributor. The commit message MUST be indistinguishable from one written by a human developer. Do not include any mentions of AI, bots, or agent involvement in the description, body, or footers. This rule is absolute and must be enforced strictly for every commit.

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

Apply this whenever a commit will be produced — an explicit `git commit`, an amend, an interactive rebase reword, or an implied commit inside a larger request such as "open a PR", "push these changes", or "prepare a pull request". A PR is only as good as the commits behind it, so classify and word each commit the same way even when the user only asked about the PR.

1. Run `git diff --cached` (or `git diff` if nothing is staged) to understand what changed.
2. Run `git log --oneline -10` to see recent commit style and any existing scope conventions.
3. Classify the change using the type selection guide above.
4. Write the commit message following the format rules.
5. Commit with the message read from a file — never inline with `-m`, and never via a shell heredoc or `>` redirect. Two steps:

   **a. Write the message to `.git/COMMIT_EDITMSG` using your agent's native file-writing capability** — the one that writes content directly, without routing it through the shell. Use whichever your runtime provides:

   | Agent | Tool |
   |-------|------|
   | Claude Code | `Write` |
   | Gemini CLI / Antigravity | `write_file` |
   | Codex | `apply_patch` (Add/Update File) |
   | Other | any built-in file create/edit tool — **not** `echo`/`cat`/`>` |

   **b. Commit from that file with plain git** (identical across every agent):

   ```bash
   git commit -F .git/COMMIT_EDITMSG
   ```

   Why a native file write instead of `git commit -m "…"` or a heredoc:
   - **No escaping** — the message never touches the shell, so `$(`, backticks, `!`, quotes, and `#` in the body can't be interpreted or trigger safety blocks.
   - **No redirects** — the file is created directly, avoiding `>`/`cat` quoting pitfalls.
   - **No permission friction** — `.git/COMMIT_EDITMSG` is git's own commit-message scratch file: always writable, never shows up in `git status`, and git overwrites it on the next commit, so there is nothing to clean up.

   `.git/COMMIT_EDITMSG` is deliberately a **relative** path — Codex's `apply_patch` rejects absolute paths, and it resolves correctly from the repo root for the others. For an amend: `git commit --amend -F .git/COMMIT_EDITMSG`. For a rebase reword, write the message to the path the rebase editor opens.

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

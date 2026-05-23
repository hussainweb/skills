# Confluence Spaces and Blogs

Confluence content is organized into **spaces** (top-level containers). Each space contains pages and blog posts. `acli` supports full CRUD on spaces and on blog posts (but, notably, not on regular pages — see `references/04-confluence-pages.md`).

## Spaces (`acli confluence space`)

| Command | Purpose |
|---|---|
| `list` | List accessible spaces. |
| `view` | Fetch one space's details by ID. |
| `create` | Create a new space. |
| `update` | Edit a space (name, description, status, type). |
| `archive` / `restore` | Move to/from archive. |
| (no `delete` in current `acli`) | Permanent space deletion is still UI/API-only. |

### `list`

```bash
acli confluence space list
acli confluence space list --type personal
acli confluence space list --expand description,homepage,permissions
acli confluence space list --keys "ENG,DESIGN"
acli confluence space list --status archived
acli confluence space list --limit 200 --json
```

| Flag | What it does |
|---|---|
| `--type` | `global` or `personal`. |
| `--keys` | Comma-separated list of space keys to filter to. |
| `--status` | `current` (default) or `archived`. |
| `--expand` | Comma list: `description`, `homepage`, `permissions`. |
| `--limit N` | Default 50. |
| `--json` | JSON output. |

### `view`

```bash
acli confluence space view --id 123456
acli confluence space view --id 123456 --include-all       # icon, labels, role-assignments, permissions, operations, properties
acli confluence space view --id 123456 --labels --permissions
```

Note that `view` takes the numeric **space ID**, while `update` and `archive` operate on the **space key** (`--key`). The CLI is asymmetric here; double-check which you have.

### `create`

```bash
acli confluence space create --key ENG --name "Engineering"
acli confluence space create --key ENG --name "Engineering" --description "Eng-wide docs"
acli confluence space create --key TEAM --name "Team X" --private
acli confluence space create --key TPL --name "Template Space" --template-key documentation
```

| Flag | What it does |
|---|---|
| `--key` | Space key (uppercase, used in URLs). Required. |
| `--name` | Display name. Required. |
| `--description` | Optional description. |
| `--private` | Create as private. |
| `--alias` | Identifier used in the page URL path (advanced). |
| `--template-key` | Use a space template. |

### `update`

```bash
acli confluence space update --key ENG --name "Engineering (renamed)"
acli confluence space update --key ENG --description "Updated description"
```

### `archive` / `restore`

```bash
acli confluence space archive --key ENG
acli confluence space restore --key ENG
```

## Blogs (`acli confluence blog`)

| Command | Purpose |
|---|---|
| `list` | List blog posts (by space, by ID, or with filters). |
| `view` | Fetch one blog post. |
| `create` | Create a blog post. |

No `update` or `delete` for blog posts in current `acli`.

### `list`

```bash
acli confluence blog list --space-id 12345
acli confluence blog list --space-id 12345 --title "Release Notes"
acli confluence blog list --space-id 12345,67890 --status current,deleted --limit 25
acli confluence blog list --id 98765 --json                                      # one specific post
acli confluence blog list --space-id 12345 --body-format storage --limit 10
acli confluence blog list --cursor "<from-previous-call>" --limit 25 --json     # paginate
```

| Flag | What it does |
|---|---|
| `--space-id` | Comma-separated space IDs. |
| `--id` | Comma-separated blog post IDs. |
| `--title` | Substring filter on title. |
| `--status` | Comma list: `current`, `deleted`, `trashed`. |
| `--body-format` | `storage`, `atlas_doc_format`. |
| `--limit N` | Default 25. |
| `--cursor` | Pagination cursor returned in a prior call. |
| `--sort` | Sort order. |
| `--json` / `--csv` | Output formats. |

### `view`

```bash
acli confluence blog view --id 98765
acli confluence blog view --id 98765 --body-format storage
acli confluence blog view --id 98765 --version 2
acli confluence blog view --id 98765 --draft
acli confluence blog view --id 98765 --include labels,properties
acli confluence blog view --id 98765 --include all --json
```

`--include` values: `labels`, `properties`, `operations`, `likes`, `versions`, `version`, `favorited`, `webresources`, `collaborators`, or `all`.

### `create`

```bash
# Inline body (Confluence storage XHTML)
acli confluence blog create --space-id 12345 --title "Release Notes" --body "<p>v1.2 is out</p>"

# Draft
acli confluence blog create --space-id 12345 --title "WIP" --status draft --body "<p>..</p>"

# Private (visible only to the author + space admins)
acli confluence blog create --space-id 12345 --title "Internal" --private --body "<p>..</p>"

# From a file
acli confluence blog create --space-id 12345 --title "Big writeup" --from-file ./post.html

# From JSON payload (full control over fields)
acli confluence blog create --generate-json > post.json
# ...edit post.json...
acli confluence blog create --from-json ./post.json

# Backdated
acli confluence blog create --space-id 12345 --title "Backdated" --created-at "2026-01-16T10:20:30.000Z" --body "<p>..</p>" --json
```

| Flag | What it does |
|---|---|
| `--space-id` | Target space ID. Required unless using `--from-json` with the field embedded. |
| `--title` | Required. |
| `--body` | Content in Confluence storage XHTML. |
| `--from-file` | Read body from a file. |
| `--from-json` | Full JSON payload (use `--generate-json` to scaffold). |
| `--status` | `current` (published) or `draft`. |
| `--private` | Visible only to author + space admins. |
| `--created-at` | ISO 8601 timestamp to backdate. |
| `--json` | JSON output. |

### Body format reminder

`--body` and `--from-file` expect **Confluence storage format** — basically XHTML with Confluence-specific macro tags. Plain `<p>...</p>` and `<h1>...</h1>` work fine; for macros, look up the storage representation in Atlassian docs. For full programmatic control over richer documents, prefer `--from-json` with the ADF/storage body embedded.

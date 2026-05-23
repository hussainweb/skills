# Confluence Pages

`acli confluence page` currently exposes a single command: `view`. There is **no `create`, `update`, or `delete` for pages in `acli`** as of v1.3.x — page authoring still goes through the Confluence UI or REST API. For blogs, see `references/05-confluence-spaces-blogs.md`; blog `create` *is* available.

## `view` — fetch a page

```bash
acli confluence page view --id 123456789
acli confluence page view --id 123456789 --json
acli confluence page view --id 123456789 --body-format storage
acli confluence page view --id 123456789 --version 3
acli confluence page view --id 123456789 --get-draft
acli confluence page view --id 123456789 --include-direct-children --include-labels --include-version
```

### How to get a page ID

Confluence page IDs are numeric, e.g. `123456789`. The user can find them:
- In the page URL: `.../wiki/spaces/SPACE/pages/123456789/Page+Title` — the digits between `/pages/` and the next `/` are the ID.
- Via the page's `...` menu → "Page details".

If the user gives you a URL, extract the ID with a regex or just slice it out — don't ask them to re-fetch.

### Flags worth knowing

| Flag | What it does |
|---|---|
| `--id` | Page ID (numeric, required). |
| `--body-format` | `storage` (Confluence XHTML), `atlas_doc_format` (ADF JSON), or `view` (rendered HTML). Pick `storage` if you'll round-trip the content via the REST API; `view` for human reading. |
| `--version N` | Fetch a specific historical version. |
| `--get-draft` | Return the draft if the page has one (and you have access). |
| `--status` | Filter by status — `current`, `draft`, `archived`, comma-separated. |
| `--include-direct-children` | Embed direct child pages in the response. |
| `--include-labels` | Embed labels. |
| `--include-version` | Embed the full version object (author, timestamp). |
| `--include-versions` | Embed the full version list. |
| `--include-collaborators` | Embed collaborator info. |
| `--include-likes` | Embed reaction/like counts. |
| `--include-operations` | Embed the operations the current user can perform. |
| `--include-properties` | Embed page content properties (custom key/value metadata). |
| `--include-favorited-by-current-user-status` | Boolean of whether the current user favorited this page. |
| `--include-webresources` | Web resources metadata (rare; useful for rendering). |
| `--json` | JSON output. Always pass this when you'll parse the result. |

### Body format selection

- `view` (default): rendered HTML, what a reader sees. Good for "summarize this page for me."
- `storage`: Confluence's storage format (XHTML-with-macros). Use when you need to preserve macros, attach the content to another page, or round-trip.
- `atlas_doc_format`: ADF JSON. Useful for programmatic editing or when piping into other ADF-aware tools.

### What's NOT available

- Creating a page (`acli confluence page create` — does not exist)
- Updating a page (`acli confluence page update` — does not exist)
- Deleting a page (`acli confluence page delete` — does not exist)
- Searching pages (no `acli confluence page search`; use the Confluence REST API or the UI)
- Listing pages in a space (no `acli confluence page list`)

If the user asks for any of these, tell them this is currently outside `acli`'s scope and suggest either:
1. The Confluence UI for one-off operations.
2. The Confluence REST API (`POST /wiki/api/v2/pages`, etc.) for automation — they'll need the API token and `curl` or a small script.
3. The Atlassian MCP server (if available in the session) — it has Confluence page create/update tools.

## Common assistant patterns

```bash
# "Summarize this Confluence page" — get the rendered HTML
acli confluence page view --id 123456789 --body-format view --json

# "Show me this page's children"
acli confluence page view --id 123456789 --include-direct-children --json

# "What labels does this page have?"
acli confluence page view --id 123456789 --include-labels --json

# "What version is this on, and who edited it last?"
acli confluence page view --id 123456789 --include-version --json
```

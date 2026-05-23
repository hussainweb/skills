# Jira Work Items

The work item is Jira's unit of work. Its `type` (Bug, Story, Task, Epic, etc.) is a field, not a separate command. `acli`'s `workitem` subcommand replaces what older Atlassian docs call `issue`.

All commands below are children of `acli jira workitem`.

## Reading: view, search

### `view` — fetch by key

```bash
acli jira workitem view PROJ-123
acli jira workitem view PROJ-123 --json
acli jira workitem view PROJ-123 --fields summary,comment,assignee
acli jira workitem view PROJ-123 --web    # open in browser
```

| Flag | What it does |
|---|---|
| `--fields` | Comma list. Special values: `*all`, `*navigable`. Prefix with `-` to exclude (e.g., `*navigable,-comment`). Default: `key,issuetype,summary,status,assignee,description`. |
| `--json` | JSON output. |
| `--web` | Open in browser instead of printing. |

### `search` — JQL or filter

```bash
acli jira workitem search --jql "project = PROJ AND status != Done"
acli jira workitem search --jql "assignee = currentUser() AND status = 'In Progress'" --json
acli jira workitem search --jql "project = PROJ" --paginate --fields "key,summary,assignee" --csv
acli jira workitem search --filter 10001         # use a saved filter by ID
acli jira workitem search --jql "..." --count    # just the count
acli jira workitem search --jql "..." --limit 50
```

| Flag | What it does |
|---|---|
| `--jql` | JQL query. One of `--jql` or `--filter` is required. |
| `--filter` | Saved filter ID. |
| `--fields` | Comma list. Default: `issuetype,key,assignee,priority,status,summary`. |
| `--limit N` | Cap result count. |
| `--paginate` | Walk all pages. Ignores `--limit`. |
| `--count` | Print just the match count. |
| `--csv` / `--json` | Output formats. |
| `--web` | Open the JQL in the browser. |

**JQL tips for the assistant:** `currentUser()` resolves to the authed account. `status != Done` is broader than `resolution = Unresolved`. Use `ORDER BY updated DESC` to surface fresh items. Always quote multi-word status names: `status = "In Progress"`.

## Writing: create, create-bulk, edit, clone

### `create`

```bash
# Minimum
acli jira workitem create --summary "New Task" --project "TEAM" --type "Task"

# With description, labels, assignee
acli jira workitem create \
  --summary "Investigate flaky test" \
  --project "TEAM" \
  --type "Bug" \
  --assignee "user@example.com" \
  --label "flake,ci" \
  --description "Steps to reproduce..."

# From a JSON template (generate first, then edit, then submit)
acli jira workitem create --generate-json > workitem.json
# ...edit workitem.json...
acli jira workitem create --from-json workitem.json

# Description from a file (supports ADF or plain text)
acli jira workitem create --summary "x" --project P --type Task --description-file ./desc.md

# Interactive (opens $EDITOR)
acli jira workitem create --project P --type Task --editor
```

Useful flags: `--summary`, `--project`, `--type` (required basics), `--assignee` (`@me`, `default`, email, or accountId), `--label` (comma list), `--parent` (for sub-tasks / child issues), `--description-file`, `--from-json`, `--generate-json`.

### `create-bulk`

For creating many issues at once — uses a JSON file. Use `--generate-json` to get the shape, then submit with the same flag.

### `edit`

Same field flags as `create`, plus targeting flags:

```bash
acli jira workitem edit --key "PROJ-1,PROJ-2" --summary "New Summary"
acli jira workitem edit --jql "project = TEAM AND assignee is EMPTY" --assignee "user@example.com"
acli jira workitem edit --filter 10001 --description "Updated description" --yes
acli jira workitem edit --key PROJ-1 --labels "ready,reviewed"   # replaces label set
acli jira workitem edit --key PROJ-1 --remove-labels "stale"
acli jira workitem edit --key PROJ-1 --remove-assignee
```

`--key` for precision, `--jql`/`--filter` for bulk. `--yes` skips the confirmation prompt; use only when scope is verified. `--ignore-errors` continues past per-item failures.

### `clone`, `delete`, `archive`, `unarchive`

These each accept `--key` / `--jql` / `--filter` for targeting and most accept `--yes` to skip confirmation. Standard CRUD shape — defer to `--help` for the few unique flags.

## Workflow: transition, assign

### `transition`

```bash
acli jira workitem transition --key "PROJ-1,PROJ-2" --status "Done"
acli jira workitem transition --jql "project = TEAM" --status "In Progress"
acli jira workitem transition --filter 10001 --status "To Do" --yes
```

The `--status` value must match a transition target available in the work item's current workflow. If it fails, view the issue and inspect available transitions in the Jira UI — `acli` doesn't currently expose a "list transitions" command.

### `assign`

```bash
acli jira workitem assign --key "PROJ-1" --assignee "@me"
acli jira workitem assign --jql "project = TEAM" --assignee "user@example.com"
acli jira workitem assign --filter 10001 --assignee "default"     # project default assignee
acli jira workitem assign --key "PROJ-1" --remove-assignee
acli jira workitem assign --from-file ./issues.txt --assignee "user@example.com"
```

Assignee identifiers: `@me`, `default`, email, or Atlassian accountId. The `default` value uses the project's configured default assignee.

## Comments

```bash
acli jira workitem comment create --key "PROJ-1" --body "This is a comment"
acli jira workitem comment create --jql "project = TEAM" --body-file ./comment.txt
acli jira workitem comment create --key "PROJ-1" --edit-last --body "Updated"   # edit your last comment
acli jira workitem comment create --jql "..." --editor                          # open $EDITOR

acli jira workitem comment list   --key PROJ-1
acli jira workitem comment update --key PROJ-1 --id <comment-id> --body "..."
acli jira workitem comment delete --key PROJ-1 --id <comment-id>
acli jira workitem comment visibility --key PROJ-1   # see visibility options
```

Bodies accept plain text or ADF (Atlassian Document Format) JSON. Plain text is fine for most uses.

## Links

```bash
acli jira workitem link create --out PROJ-123 --in PROJ-456 --type Blocks
acli jira workitem link create --from-json ./links.json
acli jira workitem link create --generate-json     # see the JSON shape

acli jira workitem link list   PROJ-123
acli jira workitem link delete --id <link-id>
acli jira workitem link type                       # list available link types
```

`--type` accepts the outward description (e.g. `Blocks`, `Relates`, `Duplicates`). Use `acli jira workitem link type` to see what's configured on the instance.

## Watchers, attachments

```bash
acli jira workitem watcher list   --key PROJ-1
acli jira workitem watcher remove --key PROJ-1 --account-id <id>

acli jira workitem attachment list   --key PROJ-1
acli jira workitem attachment delete --id <attachment-id>
```

There is no `watcher add` or `attachment add` in current `acli` — for those, the Jira UI or REST API is still required.

## Patterns the assistant should follow

- **Always view or search first** before bulk `edit`, `transition`, `delete`, or `archive` with a `--jql`. The cost of "let me confirm the scope" is tiny vs. the cost of mass-mutating the wrong items.
- **Prefer `--key` to `--jql`** when the user has named specific items.
- **`--yes` is dangerous on JQL targeting.** A misspelled JQL like `project = PROJ` (omitting an AND clause) can match thousands. Confirm count first with `--count`.
- **JSON output for chained reasoning.** When you'll consume the result, pass `--json`. Don't scrape table output.
- **`--from-json` for complex creates.** If a create needs custom fields or rich ADF, use `--generate-json` to scaffold the template, then submit.

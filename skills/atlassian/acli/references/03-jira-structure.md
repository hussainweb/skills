# Jira Structure: Projects, Boards, Sprints, Filters, Fields, Dashboards

These commands manage the *containers* and *configuration* around work items.

## Projects (`acli jira project`)

| Command | Purpose |
|---|---|
| `list` | List projects. `--recent` for top 20 recently viewed; `--paginate` for all; `--limit N` to cap; `--json`. Default limit is 30. |
| `view` | Fetch a single project's details. |
| `create` | Create a project. Either `--from-project EXISTING --key NEW --name "..."` (clone-style) or `--from-json file.json`. Use `--generate-json` to scaffold. |
| `update` | Edit project fields. |
| `archive` / `restore` | Soft delete / undelete. |
| `delete` | Permanent — be very sure. |

Examples:

```bash
acli jira project list --json --paginate
acli jira project create --from-project TEAM --key NEWTEAM --name "New Team" --lead-email lead@example.com
```

**Note:** `--from-project` only works with company-managed projects, not team-managed ones.

## Boards (`acli jira board`)

| Command | Purpose |
|---|---|
| `search` | Find boards across the instance. |
| `get` | Fetch one board by ID. |
| `list-projects` | List the projects associated with a board. |
| `list-sprints` | List sprints belonging to a board. |
| `create` | Create scrum or kanban board. Requires `--name`, `--type`, `--filter-id`, `--location-type`. If `location-type=project`, also `--project`. |
| `delete` | Remove a board (or several). |

```bash
acli jira board create \
  --name "Team Alpha Scrum" \
  --type scrum \
  --filter-id 10040 \
  --location-type project \
  --project TEAM
```

`--type` is `scrum` or `kanban`. `--location-type` is `project` or `user` (personal board). Board creation needs a backing **filter ID** — create a filter first via the Jira UI or `acli jira filter` (note: `acli jira filter` doesn't currently expose `create`; filters are typically created in the UI then referenced here).

## Sprints (`acli jira sprint`)

| Command | Purpose |
|---|---|
| `create` | Create a sprint. Requires `--name` and `--board`. Optional `--start`, `--end`, `--goal`. |
| `view` | Fetch sprint details. |
| `update` | Edit a sprint (start/end/state/goal). |
| `list-workitems` | List work items in a sprint. |
| `delete` | Delete one or more sprints. |

```bash
acli jira sprint create --name "Sprint 12" --board 5 --start 2026-01-01 --end 2026-01-14 --goal "Ship payments v2"
acli jira sprint list-workitems --id 42 --json
```

Dates accept either `YYYY-MM-DD` or full ISO 8601 (`2026-01-01T09:00:00Z`).

## Filters (`acli jira filter`)

Saved JQL queries that the Jira UI surfaces.

| Command | Purpose |
|---|---|
| `list` | List the user's filters or favorites. |
| `search` | Search across all filters visible to the user. |
| `get` | Fetch one filter by ID. |
| `update` | Edit a filter. |
| `get-columns` / `reset-columns` | Manage the filter's configured columns. |
| `add-favourite` | Mark a filter as favorite. |
| `change-owner` | Reassign filter ownership. |

There is no `filter create` or `filter delete` — those still go through the Jira UI or REST API.

## Custom Fields (`acli jira field`)

| Command | Purpose |
|---|---|
| `create` | Create a custom field. |
| `update` | Edit a custom field. |
| `delete` | Move a custom field to trash. |
| `cancel-delete` | Restore from trash. |

Custom field operations are typically admin-only and rare — most teams configure fields in the UI. Reach for these in automation/migration scenarios.

## Dashboards (`acli jira dashboard`)

`acli jira dashboard search` is the only dashboard command — finds dashboards by query. There's currently no create/edit/delete for dashboards.

## Quick decision matrix

| User says… | Reach for… |
|---|---|
| "show me my open issues" | `workitem search --jql "assignee = currentUser() AND status != Done"` |
| "list the projects I can see" | `project list --paginate` |
| "what sprints does board 5 have" | `board list-sprints --id 5` |
| "create a new scrum board for project X" | `board create --type scrum --location-type project --project X --filter-id <id> --name "..."` |
| "start a sprint named Y" | `sprint create --name Y --board <id> --start ... --end ...` (note: actually *starting* the sprint may require `sprint update --state active`) |
| "find filters matching foo" | `filter search ...` then `filter get --id <id>` |

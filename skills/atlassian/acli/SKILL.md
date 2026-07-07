---
name: acli
description: Drive Atlassian Cloud (Jira and Confluence) from the command line via `acli`. Use this skill whenever the user wants to view, search, create, edit, transition, comment on, or link Jira work items; manage Jira projects, boards, sprints, or filters; view Confluence pages; or create/list Confluence spaces and blog posts. Triggers on "acli", "atlassian cli", "jira issue", "jira ticket", "work item", any Jira-style issue key (e.g. PROJ-123), "JQL", "confluence page", "confluence space", "confluence blog", or requests to authenticate to Jira/Confluence with an API token. Prefer this skill over hand-rolled REST calls whenever `acli` is installed.
allowed-tools: Bash, Read, Grep, Glob
metadata:
  authors: "Hussain Abbas"
  version: "1.1.0"
---

# Atlassian CLI (acli) Guide

You are helping the user work with Atlassian Cloud — Jira work items and Confluence pages/spaces/blogs — through the official `acli` CLI. `acli` is a single binary that talks to Atlassian Cloud, authenticates per-site (per Atlassian instance), and exposes most of what the Jira and Confluence REST APIs offer through ergonomic subcommands.

This skill scopes to the **`jira`** and **`confluence`** subtrees and to **API-token authentication** (not OAuth/web login). Other subtrees — `admin`, `rovodev` — are intentionally out of scope here.

**References:** Detailed command tables live in `references/` inside this skill. Load them only when you need the depth — the body below covers the common path.

## Step 1 — Verify `acli` is installed and authenticated

Before running anything, confirm `acli` exists and is authenticated for the product the task touches. Auth is **per-product** (Jira and Confluence each have their own login state), even when both point at the same Atlassian site.

```bash
acli --version                # confirms install (1.x or newer)
acli jira auth status         # for Jira tasks
acli confluence auth status   # for Confluence tasks
```

A healthy status prints `✓ Authenticated`, the site, the email, and the authentication type (`api_token` or OAuth). If it prints `✗ Not authenticated`, follow Step 2.

If `acli` is not on the PATH at all, stop and tell the user — don't try to install it silently. Point them at https://developer.atlassian.com/cloud/acli/guides/install-acli/.

## Step 2 — Authenticate with an API token (when needed)

The user asked for token-based auth specifically — that's the `--token` flow. It reads the token from **stdin**, so the token never appears in shell history or `ps` output. This matters: never put the token on the command line as a flag value.

You need three pieces of information from the user before authenticating:

1. **Site** — the Atlassian site hostname, e.g. `mysite.atlassian.net` (no scheme, no trailing slash)
2. **Email** — the Atlassian account email
3. **API token** — created at https://id.atlassian.com/manage-profile/security/api-tokens

If the user hasn't given you these, ask. Don't guess the site from prior context — sites differ.

**Jira login (token via stdin):**

```bash
# Token read from a file
acli jira auth login --site "mysite.atlassian.net" --email "user@example.com" --token < /path/to/token.txt

# Token piped in
echo "<token>" | acli jira auth login --site "mysite.atlassian.net" --email "user@example.com" --token
```

**Confluence login:** same shape, just swap `jira` → `confluence`.

```bash
acli confluence auth login --site "mysite.atlassian.net" --email "user@example.com" --token < /path/to/token.txt
```

**Important nuances:**

- The `--token` flag is a *switch*, not a value-bearing flag. It tells `acli` "read the token from stdin." Do **not** write `--token "abc123..."`.
- If you ask the user to run the command themselves (recommended when their token isn't already in a file you can read), suggest the `! <command>` form so the output lands in the session — see the session guidance at the top of the harness.
- Authenticate Jira and Confluence separately even if it's the same site. `acli jira auth login` does not log you into Confluence.
- For multiple sites, run `auth login` again with a different `--site` and use `acli jira auth switch` / `acli confluence auth switch` to change the active account later.

For OAuth (`--web`), account switching, logout, and the global `acli auth` tree (which manages OAuth-only sessions across products), read `references/01-authentication.md`.

## Step 3 — Pick the right subcommand

Map the user's intent to a command before typing it. The high-level shape:

```
acli jira       workitem   (create | search | view | edit | transition | assign | comment | link | clone | delete | archive | watcher | attachment)
                project    (create | list | view | update | archive | restore | delete)
                board      (create | get | search | list-projects | list-sprints | delete)
                sprint     (create | view | update | list-workitems | delete)
                filter     (search | get | list | update | get-columns | reset-columns | add-favourite | change-owner)
                field      (create | update | delete | cancel-delete)
                dashboard  (search)

acli confluence page       (view)
                space      (create | list | view | update | archive | restore)
                blog       (create | list | view)
```

**Some of those are command *groups*, not verbs.** `comment`, `link`, `watcher`, and `attachment` require a further subcommand (`comment create`, `comment list`, `link create`, …) — and their flags live on the subcommand, not the group. Also note that most write commands target items via `--key`, not a positional argument:

```bash
acli jira workitem comment PROJ-1 --body "hi"              # ✗ unknown flag: --body
acli jira workitem comment create --key PROJ-1 --body "hi" # ✓
```

Only `view` and `link list` take the key positionally. When in doubt, run `acli jira workitem <group> --help` to list subcommands before composing a call.

When the user says "issue" or "ticket" or "story" or "bug" — they mean a **work item**. `acli` renamed `issue` to `workitem` to align with Jira's modern terminology. The work item is the unit of work; its `type` field is what makes it a Bug/Story/Task/Epic.

## Step 4 — Use JSON/CSV output when you'll consume the result

`acli` has rich human-readable output by default. When you (the assistant) need to parse the result to chain into another step, pass `--json` (or `--csv` where supported, e.g. `workitem search`). The JSON shape is stable and far easier to reason about than scraping the table output.

```bash
acli jira workitem view PROJ-123 --json
acli jira workitem search --jql "project = PROJ AND status != Done" --json --paginate
acli confluence space list --json
```

For multi-page results, use `--paginate` to walk through everything, or `--limit N` to cap.

**The JSON shape is *not* uniform across commands — and some are lossy.** Each command's `--json` is stable release-to-release, but different commands return very different levels of fidelity:

- `workitem view --json` returns the **raw Jira REST payload**: full `fields`, `changelog`, `renderedFields`, and complete identity objects (`accountId`, `displayName`, `emailAddress`) for people-valued fields.
- `comment list --json` returns a **simplified, lossy** shape: the author is flattened to a display-name string (no accountId) and the body is flattened to plain text (ADF structure, mentions, and links stripped). It is not round-trippable — never use it as the source for re-posting or editing a formatted comment.

If a lossy view is missing data you need (e.g. an accountId), check whether a richer command exposes it before concluding acli can't provide it — `workitem view --json` is usually the richest surface.

Human-readable output is also expensive to consume: it renders heavy ANSI box-drawing tables (a modest comment list can exceed 30 KB of terminal output). Any output you'll parse or reason over should be `--json`.

## Step 5 — Use the right reference for depth

The SKILL.md body above is the common path. Load these only when the task needs the detail:

| If the task is about… | Read |
|---|---|
| Token/OAuth auth, switching accounts, multiple sites | `references/01-authentication.md` |
| Creating/searching/editing/transitioning Jira work items, JQL patterns, bulk ops | `references/02-jira-workitems.md` |
| Projects, boards, sprints, filters, fields, dashboards | `references/03-jira-structure.md` |
| Viewing Confluence pages (incl. body formats, versions, child pages) | `references/04-confluence-pages.md` |
| Confluence spaces and blogs | `references/05-confluence-spaces-blogs.md` |

Each reference is a focused command table with flags, examples, and the gotchas that matter in practice.

## Key principles

**Read before you write.** When the user asks you to edit, transition, or delete a work item, first `view` (or `search`) it to confirm you have the right one. `acli jira workitem edit --jql "..."` without `--yes` will at least prompt, but a misformed JQL can match hundreds of issues — confirm scope before committing.

**`--yes` is irreversible-adjacent.** Flags like `--yes` on `edit`, `transition`, `delete`, `archive` skip the confirmation prompt. Use them only when you've already confirmed the scope with the user, or when the operation targets a specific key list you've verified. Don't reflexively add `--yes` to make a script "cleaner."

**Prefer keys over JQL when you have them.** If the user gives you `PROJ-123`, use `--key PROJ-123`. JQL is for discovery; keys are for precision.

**Don't embed tokens in commands.** Always use `--token < file` or `echo $TOKEN | ... --token`. Never `--token "<actual-token>"` — that's not even a valid form and it would leak the token anyway.

**Site identifiers are bare hostnames.** Use `mysite.atlassian.net`, not `https://mysite.atlassian.net/` or `mysite`. The CLI will reject scheme prefixes and trailing slashes.

**Authentication state lives on the user's machine.** If `acli jira auth status` says authenticated, trust it — don't re-authenticate "just to be sure." Re-auth invalidates any active session.

**Atlassian Government Cloud is not supported by `acli`.** If the user's site looks like a `.atlassian-gov.com` or similar, stop and tell them — the tool won't work there.

# Authentication

`acli` keeps **separate authentication state per product**. `acli jira auth login` does not authenticate Confluence and vice versa — even when both target the same Atlassian site. The global `acli auth` tree is OAuth-only and orthogonal to the per-product token auth this reference covers.

## Three auth surfaces

| Command tree | Mechanism | When to use |
|---|---|---|
| `acli auth ...` | OAuth only (global, all products) | Interactive humans who want browser-based auth across products |
| `acli jira auth ...` | OAuth (`--web`) **or** API token (`--token`) | Headless/scripted workflows, or per-product control |
| `acli confluence auth ...` | OAuth (`--web`) **or** API token (`--token`) | Same as Jira, but for Confluence |

For automated/scripted use — which is the common case for an AI assistant — **prefer per-product API tokens**.

## API token login (the focus)

The `--token` flag on `acli jira auth login` and `acli confluence auth login` reads the token from **stdin**. It is a switch, not a value-bearing flag.

### Inputs you need

1. **Site** — bare hostname like `mysite.atlassian.net`. No `https://`, no trailing slash.
2. **Email** — the Atlassian account email tied to the token.
3. **API token** — created at https://id.atlassian.com/manage-profile/security/api-tokens. Atlassian also supports scoped tokens; `acli`'s `--token` flow uses unscoped tokens (the docs explicitly say "without scopes").

### Jira

```bash
# From a file on disk
acli jira auth login \
  --site "mysite.atlassian.net" \
  --email "user@example.com" \
  --token < /path/to/token.txt

# Piped from a command (e.g. a secrets manager)
gcloud secrets versions access latest --secret=jira-token \
  | acli jira auth login --site "mysite.atlassian.net" --email "user@example.com" --token

# Piped from an env var (loses zero benefit vs --token flag value, but doesn't show in ps)
printenv JIRA_TOKEN | acli jira auth login --site "mysite.atlassian.net" --email "user@example.com" --token
```

### Confluence

Identical shape — swap `jira` → `confluence`:

```bash
acli confluence auth login \
  --site "mysite.atlassian.net" \
  --email "user@example.com" \
  --token < /path/to/token.txt
```

### Windows / PowerShell

```powershell
Get-Content token.txt | .\acli.exe jira auth login --site "mysite.atlassian.net" --email "user@example.com" --token
```

### What NOT to do

- `--token "<actual-token-string>"` — `--token` does not accept a value. The CLI will misinterpret your token as a positional argument and fail (or worse, leak the token in `ps`/history).
- Embedding the token in a one-liner like `acli ... --token <<< "abc123"` is fine on bash/zsh, but avoid `echo "abc123" | ...` if the token might end up in shell history.
- Don't authenticate inside the agent's session unless the user already has the token in a readable file or stdin source. If unsure, give the user the `! <command>` snippet and let them run it.

## Status, switch, logout

```bash
acli jira auth status         # Shows: ✓ Authenticated / Site / Email / Authentication Type
acli confluence auth status

acli jira auth switch                                  # Interactive picker
acli jira auth switch --site mysite.atlassian.net
acli jira auth switch --site mysite.atlassian.net --email user@example.com

acli jira auth logout         # Logs out of the active Jira account
acli confluence auth logout
```

`auth status` output for a healthy token-authenticated account looks like:

```
✓ Authenticated
  Site: mysite.atlassian.net
  Email: user@example.com
  Authentication Type: api_token
```

`Authentication Type: api_token` confirms the user is on the token flow (vs OAuth).

## Where auth state lives — and why it isn't reusable

acli stores its per-product auth state in YAML files under `~/.config/acli/` (e.g. `jira_config.yaml`, `confluence_config.yaml`, `global_auth_config.yaml`). The config files list each registered `(site, email)` pair; credentials themselves are held by acli, not exposed for reuse.

Two practical consequences:

- **acli auth ≠ a REST credential.** When acli lacks a capability and you're tempted to fall back to `curl` against the REST API, you cannot borrow acli's session. An env var like `JIRA_API_TOKEN` on the machine is *not necessarily* the same token acli registered, and may belong to a different site or account entirely — verify independently before using it, and don't probe multiple identity/site combinations to find one that works. If a REST fallback is genuinely needed, ask the user for the right credential.
- **Reading the config is the fast way to answer "which sites/emails are registered?"** — `grep` the YAML for `site:`/`email:` lines rather than re-running `auth status` per product. Never print token/secret fields.

## Multiple sites / multiple accounts

You can `auth login` once per `(site, email)` pair and switch between them. The per-product state means `acli jira auth switch` does not affect Confluence — switch each product independently.

## OAuth (`--web`) — for completeness

If the user wants browser-based auth:

```bash
acli jira auth login --web
acli confluence auth login --web
# Or the global form, which logs in across products in one flow:
acli auth login
```

OAuth is great for interactive use, awkward for CI/automation. The token flow exists precisely for the latter.

## Government Cloud

`acli` does not support Atlassian Government Cloud. If the user's site is on a gov-cloud domain, stop and tell them.

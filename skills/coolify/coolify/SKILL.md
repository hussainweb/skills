---
name: coolify
description: Deploy and operate applications on self-hosted Coolify (v4.1+, current line 4.3.x) — Docker Compose resources, environment-variable conventions that make settings overrideable in the UI, shared databases and Redis, PHP/Laravel/Drupal deployments, GitHub Actions pipelines that build on the server or push to GHCR, and diagnosing 503 / "no available server" routing failures. Use this skill whenever Coolify is mentioned or present (a repo whose docker-compose.yml is deployed by Coolify, a COOLIFY_* variable, a coolify-proxy or coolify-db container, a deploy webhook), and whenever writing or reviewing a docker-compose.yml, Dockerfile, or CI workflow that targets a Coolify server. Triggers on "coolify", "coolify deploy", "deploy webhook", "coolify compose", "SERVICE_FQDN", "COOLIFY_FQDN", "coolify-proxy", "no available server", "deploy to my VPS with coolify".
allowed-tools: Read, Glob, Grep, Bash, WebFetch
---

# Coolify Deployment and Operations

You are working with **Coolify**, a self-hosted PaaS that manages Docker workloads on servers it reaches over SSH. This skill covers deploying applications to it correctly and diagnosing them when they break.

**References:** all reference files live in the `references/` directory of this skill. Read the ones the task needs — do not read them all.

---

## Rule 0 — Establish the version before applying any remembered knowledge

**This is the most important instruction in this skill.** Coolify 4 spent roughly two years in beta (`4.0.0-beta.*`) and only reached a stable `4.0.0` on **27 April 2026**. Concepts, magic-variable handling, UI affordances, API methods and the database schema all moved substantially across those betas. Almost all third-party write-ups — and almost all of an LLM's recalled knowledge — describe the beta era and are **wrong about the current product**.

Concretely: assume nothing you "remember" about Coolify column names, API verbs, label output, or UI location is true. Check it.

```sh
# From any Coolify-managed container on an application server
docker inspect <container> --format '{{index .Config.Labels "coolify.version"}}'

# Or from the API (control plane)
curl -fsS -H "Authorization: Bearer $COOLIFY_API_TOKEN" https://<coolify-host>/api/v1/version
```

The UI also shows it under the logo in the sidebar. Do this **first**. When the version cannot be established, say so and treat every version-sensitive claim as unverified rather than guessing.

Known-current facts, useful as a sanity anchor:

| Fact | Value |
| --- | --- |
| Stable line at time of writing | **4.3.x** (4.3.2, 13 Aug 2026) |
| First stable 4.0.0 | 27 Apr 2026 |
| State-changing API endpoints | **POST only** since 4.2.0 — `GET` returns `405` |
| Proxy | Traefik (v3.7 tracked since 4.3.0); Caddy optional |
| Deploy endpoint | `POST /api/v1/deploy?uuid=<uuid>` |

Full version-sensitivity guidance and recent breaking changes: `references/01-architecture-and-versions.md`.

---

## Rule 1 — Runtime state beats configuration reasoning

When something does not work, **inspect the running system before theorising**. `docker inspect`, a query against Coolify's own Postgres, and a side-by-side comparison against a working resource on the same host resolve in seconds what hours of reading configuration will not.

The single highest-value diagnostic is comparing a broken resource's container labels against a working one on the same server. See `references/08-troubleshooting.md`.

Corollary: **the UI's "Show Deployable Compose" preview is not evidence.** It *generates* a rendering for display; it is not necessarily what was deployed.

---

## Rule 2 — Your compose file is an input, not the artefact

Coolify parses your `docker-compose.yml`, rewrites it, merges its own state into it, and runs the result. It injects labels, networks, container names, an `env_file`, and its own environment variables; it renames your volumes; it appends `ARG` lines to your Dockerfile; and it drops every comment when it re-serialises. Debug the artefact, not the input.

Details, and the rules that follow from this (no custom `networks:`, no `ports:` on proxied services, one `build:` per image tag): `references/02-docker-compose.md`.

---

## Rule 3 — Every operator-tunable setting goes through `environment:` with a default

Coolify discovers environment variables by parsing the `environment:` block of your compose file on first deploy. A value that is not written in the interpolation form does not become an editable variable in the UI.

```yaml
services:
  web:
    environment:
      - DB_HOST=${DB_HOST:-127.0.0.1}   # editable in the UI, has a safe default
      - APP_KEY=${APP_KEY}              # editable, required, no default
      - APP_ENV=production              # hard-coded, NOT operator-editable
```

This is 12-factor with one Coolify-specific convention attached. Full rules — build-time vs runtime variables, shared `{{team.*}}` / `{{project.*}}` / `{{environment.*}}` variables, magic `SERVICE_*` variables, literal and multiline handling, and the variable-store drift trap: `references/03-environment-variables.md`.

---

## Workflow

### Setting up a new project for Coolify

1. Establish the target Coolify version (Rule 0).
2. Choose the build model — build on the Coolify server, or build in CI and pull an image. See `references/07-github-actions-deployment.md` §1 for the trade-off; it determines the shape of the compose file.
3. Write `docker-compose.yml` following `references/02-docker-compose.md`.
4. Write the `environment:` blocks following `references/03-environment-variables.md`, and keep `.env.example` in parity with them.
5. Decide where the database, cache, and search live — in-stack, Coolify-managed and shared, or external: `references/04-shared-infrastructure.md`.
6. Apply the stack-specific reference: `references/05-php-applications.md` for PHP/Laravel/FrankenPHP, and additionally `references/06-drupal.md` for Drupal.
7. Add CI: `references/07-github-actions-deployment.md`. The deploy job should target a deliberately chosen GitHub environment (or deliberately none) — see §7 of that reference; never emit `environment: production` as boilerplate.
8. Validate locally before pushing — `docker compose config` as its own step, not chained onto a commit.

### Debugging a deployed resource

Go to `references/08-troubleshooting.md` and work the symptom → check → cause table. Do not skip to a theory.

### Reviewing someone else's Coolify setup

Read `references/02-docker-compose.md` and `references/03-environment-variables.md`, then check the file against the "Review checklist" at the end of each.

---

## Things that are always wrong

Flag these on sight, in any Coolify-targeted compose file:

- A custom `networks:` block. Coolify creates and manages the network; defining your own causes intermittent HTTPS outages because containers land on two networks and Traefik picks non-deterministically.
- `ports:` on a service that is meant to be reached through the proxy. It bypasses Traefik, exposes the container on the host interface, and invalidates any assumption that `X-Forwarded-*` headers are trustworthy.
- Two or more services carrying `build:` while sharing one `image:` tag. buildx bake runs them in parallel and they race on export: `image "…": already exists`.
- An image tag with no `pull_policy: always` in a registry-pull deployment. Redeploy will keep serving the stale local copy of `latest`.
- Secrets baked into the image, or committed in the compose file rather than referenced as `${VAR}`.
- A healthcheck that only accepts `200`. See `references/05-php-applications.md` §4 — 302, 401 and 403 are all normal for a correctly configured app in some states.

## Communicating about Coolify

State the version any claim applies to. When a behaviour was not verified against the running instance, say that plainly rather than presenting recall as fact. When a fix and a recovery coincide, do not claim the fix caused the recovery without a test that would have distinguished them.

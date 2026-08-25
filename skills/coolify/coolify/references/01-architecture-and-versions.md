# Coolify Architecture and Version Discipline

## 1. Why version discipline comes first

Coolify 4 was in beta (`4.0.0-beta.1` … `4.0.0-beta.4xx`) for roughly two years and only reached stable `4.0.0` on **27 April 2026**. The stable line has moved quickly since:

| Version | Released | Notable |
| --- | --- | --- |
| 4.0.0 | 27 Apr 2026 | First stable release |
| 4.1.x | May–Jun 2026 | 4.1.2 on 4 Jun 2026 |
| 4.2.0 | 21 Jul 2026 | **Breaking:** API state-changing endpoints POST-only; Member role read-only |
| 4.3.0 | 12 Aug 2026 | **Breaking:** compose proxy router naming; UI redesign; Traefik 3.7 |
| 4.3.2 | 13 Aug 2026 | Current stable at time of writing |

The practical consequence: **"Coolify 4" is not a usable version identifier**, and material written before mid-2026 — including most blog posts, most forum answers, and most of a language model's recalled knowledge — describes the beta era. Recalled details about schema columns, API verbs, generated labels and UI locations are frequently wrong.

This is not hypothetical. A query written against `applications.is_container_label_escape_enabled`, a column remembered from an older schema, failed outright:

```
ERROR:  column "is_container_label_escape_enabled" does not exist
```

The real columns had to be found by introspection. Assume the same of anything else recalled rather than checked.

## 2. Establishing the running version

Three independent ways, in order of convenience:

```sh
# 1. Every Coolify-managed container records it as a label
docker inspect <container> --format '{{index .Config.Labels "coolify.version"}}'

# 2. The API
curl -fsS -H "Authorization: Bearer $COOLIFY_API_TOKEN" https://<coolify-host>/api/v1/version

# 3. The UI — under the logo in the sidebar
```

Dump a container's full label set when you need more context:

```sh
docker inspect <container> --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' | sort
```

## 3. Recent breaking changes worth checking for explicitly

### 4.2.0 — state-changing API endpoints require POST

`GET` on these now returns `405 Method Not Allowed`:

```
/deploy                     /servers/{uuid}/validate
/enable                     /applications/{uuid}/{start,restart,stop}
/disable                    /databases/{uuid}/{start,restart,stop}
                            /services/{uuid}/{start,restart,stop}
                            /services/{uuid}/applications/{app_uuid}/{start,restart,stop}
```

**This silently breaks older CI pipelines.** A deploy step written as `curl -fsSL "$COOLIFY_WEBHOOK_URL"` issues a `GET` and worked up to 4.1.x. Against 4.2.0+ it fails. Every deploy trigger must send `POST`:

```sh
curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_WEBHOOK_URL"
```

Verified against the shipped OpenAPI spec: `/deploy` declares only `post`.

### 4.2.0 — Member role is read-only

Team members with the **Member** role can view resources and configuration but can no longer create, update, delete, deploy, start or stop anything. Anyone who still needs write access must be promoted. Check this before diagnosing "the deploy button does nothing".

### 4.3.0 — compose proxy router names changed

Router names for Compose services whose names contain dots or hyphens now use a stable suffix. Any custom Traefik reference to the previous router names must be updated. The same release also fixed compose domain and environment-variable handling for such service names — a good reason to keep service names simple and lowercase (`web`, `worker`, `redis`) rather than `web.api` or `redis-cache-1`.

### 4.3.0 — deploy confirmation dialogs removed

Deploy, redeploy and force-deploy fire immediately when selected. Assume a click is a deploy.

## 4. What Coolify actually is

### Control plane

One host runs the Coolify application itself, as a set of containers:

| Container | Role |
| --- | --- |
| `coolify` | The Laravel application and UI |
| `coolify-db` | Postgres; user and database are both `coolify` |
| `coolify-redis` | Queues and cache |
| `coolify-realtime` | WebSocket push for the UI |
| `coolify-proxy` | Traefik, if the control-plane host also runs workloads |

The control plane reaches every application server **over SSH** and drives Docker there. It does not require an agent.

### Application servers

Each server runs Docker plus a `coolify-proxy` container (Traefik by default, Caddy optionally). Coolify attaches the proxy to each resource's network at deploy time. Deployments run through a helper container, `ghcr.io/coollabsio/coolify-helper`, which clones the repository and executes the build.

### Resource hierarchy

```
Team
└── Project
    └── Environment          (production, staging, …)
        └── Resource         (Application | Database | Service)

Server
└── Destination              (a Docker network on that server)
```

A resource is deployed to a *destination* on a *server*. Environment variables can be shared at team, project and environment level — see `03-environment-variables.md`.

### Resource types

| Type | What it is |
| --- | --- |
| **Application** | Deployed from git or a registry image. Build packs: Nixpacks, Railpack, Static, Dockerfile, **Docker Compose**, Docker Image |
| **Database** | A Coolify-managed standalone Postgres / MySQL / MariaDB / MongoDB / Redis / KeyDB / Dragonfly / ClickHouse, with backups |
| **Service** | A one-click stack from Coolify's template catalogue |

For the applications this skill is about, the build pack is almost always **Docker Compose**. See `02-docker-compose.md`.

#### The auto-detect build packs: Nixpacks and Railpack

Verified as of August 2026:

- **Nixpacks is in maintenance mode.** Railway, its maker, states in the project README: "This project is currently in maintenance mode and is not under active development. We recommend using Railpack as a replacement." It still works and remains listed in Coolify's UI and docs without a deprecation banner, but it is not gaining new language/version support.
- **Railpack** is Railway's successor (BuildKit-based, `railpack.json`, Mise instead of Nix). Coolify added it as a build pack in **v4.1.0 (18 May 2026)** and its docs still label it **Beta**; Railpack-related fixes continued landing through 4.2.0, so on older instances check the version (Rule 0) before assuming it exists.

When auto-detection fits the app at all — a single container, no workers, no sidecars, defaults acceptable — prefer **Railpack for new applications** and treat an existing Nixpacks app as migration-eligible rather than something to build on (config moves from `nixpacks.toml`/`NIXPACKS_*` to `railpack.json`/`RAILPACK_*`). The moment the app needs a second container, a queue worker, precise image control, or a CI-built image, graduate to Docker Compose and the rest of this skill applies.

For Railpack configuration itself — `railpack.json`, `RAILPACK_*` variables, plan inspection and debugging — do not recreate guidance here: use the official Railpack skill maintained in the `railwayapp/railpack` repo (`npx skills add railwayapp/railpack`), or its live docs index at <https://railpack.com/llms.txt>. This skill only covers the Coolify side of the seam (build-pack selection, variables entered as build-time variables in the Coolify UI, version availability).

## 5. Introspecting Coolify's own state

Coolify's Postgres is ground truth for what Coolify *thinks*, as opposed to what it renders. On the control plane:

```sh
# What columns actually exist on this version — do this before writing any query
docker exec coolify-db psql -U coolify -d coolify -t -A -c \
  "select column_name from information_schema.columns
   where table_name='applications' order by column_name;"

# Resource overview
docker exec coolify-db psql -U coolify -d coolify -t -A -F' | ' -c \
  "select uuid, name, coalesce(docker_compose_domains,'<NULL>'),
          length(coalesce(custom_labels,'')), coalesce(nullif(fqdn,''),'<EMPTY>')
   from applications order by name;"

# Which servers exist, and at which addresses
docker exec coolify-db psql -U coolify -d coolify -t -A -F' | ' -c \
  "select name, ip, \"user\", port from servers;"
```

Columns that matter on `applications` (verify they exist on your version): `fqdn`, `docker_compose_domains` (JSON, per-service domains), `custom_labels`, `docker_compose`, `docker_compose_raw`, `docker_compose_location`, `docker_compose_custom_build_command`, `docker_compose_custom_start_command`. Deploy output lands in `activity_log.properties`.

**`custom_labels` holds user-added labels only.** It is empty on most working applications. Its being empty means nothing.

## 6. Reaching the servers

In a typical cloud deployment the application servers admit SSH only from the control plane.

- The application server's **public** hostname is often unreachable even from the control plane, because that traffic hairpins out through the internet gateway and back. Jump to the **private/VPC address**.
- Coolify knows the right address: `select name, ip, "user", port from servers;`.
- No Coolify-managed key is needed if an ordinary developer key is authorised on both hosts:

  ```
  Host app-server
    HostName 10.0.x.y
    User ubuntu
    ProxyJump ubuntu@<control-plane-host>
  ```
- `docker` on the application server usually needs `sudo` for a non-root login.

## 7. Areas to re-verify on any version other than the one you tested

Treat these as version-bound and check rather than recall:

- Magic variable syntax and semantics (`SERVICE_FQDN_*`, `SERVICE_URL_*`, `SERVICE_PASSWORD*`), including which forms are recognised and what each emits.
- Where a domain is stored for a Compose resource — `applications.fqdn` vs `applications.docker_compose_domains` — and which one the UI writes.
- The generated Traefik label set, and whether `loadbalancer.server.port` is ever emitted.
- The `applications` table schema.
- Whether the Traefik API is exposed. On 4.1.x it is not (`--api.insecure=false`), so Traefik cannot be asked what it resolved.
- Pre/post-deployment commands and scheduled tasks — availability, and which container they target.
- Whether the compose file is re-read from git on every deploy or served from stored state.

The diagnostics in `08-troubleshooting.md` inspect Docker and Postgres directly rather than Coolify's UI, so they survive version changes better than anything describing Coolify's own behaviour.

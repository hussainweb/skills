# Coolify Architecture and Version Discipline

## 1. Why version discipline comes first

Coolify 4 was in beta (`4.0.0-beta.1` … `4.0.0-beta.4xx`) for roughly two years and only reached stable `4.0.0` on **27 April 2026**. The stable line has moved quickly since:

| Version | Released | Notable |
| --- | --- | --- |
| 4.0.0 | 27 Apr 2026 | First stable release |
| 4.1.x | May–Jun 2026 | 4.1.2 on 4 Jun 2026 |
| 4.2.0 | 21 Jul 2026 | **Breaking:** API state-changing endpoints POST-only; Member role read-only |
| 4.3.0 | 12 Aug 2026 | **Breaking:** compose proxy router naming; UI redesign; Traefik 3.7 |
| 4.3.2 | 13 Aug 2026 | Stable at first writing |
| 4.3.15 | 3 Sep 2026 | **Behaviour change:** domain ports moved out of `fqdn` into `domain_port_overrides`; restart limits introduced with a default of 10 |
| 4.3.19 | 10 Sep 2026 | **Behaviour change:** Sentinel mandatory on regular servers; compose images pulled *before* the old containers stop |
| 4.3.22 | 18 Sep 2026 | **Breaking:** host-path persistent volumes removed from UI and API |

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

### 4.3.15 — domain ports moved into a separate override map

A `saving` hook on `Application`, `ApplicationPreview` and `ServiceApplication` now runs `DomainPortOverrides::normalize()`, which strips the port out of the domain and stores it alongside:

```
fqdn "https://host:8080"  →  fqdn "https://host" + domain_port_overrides {"https://host": 8080}
```

New columns on all three tables (`add_domain_port_overrides_to_*`). The label generator followed:

```php
// ≤ 4.3.14
$port = $url->getPort();
// 4.3.15+
$port = $url->getPort() ?? ($domainPortOverrides[$portlessDomain] ?? null);
```

Three consequences:

- **A portless domain no longer means "no port configured."** Check `domain_port_overrides` before concluding anything from the domain string alone.
- **Entering `https://host:8080` still works as input**, but the domain will read back portless and the port appears in its own UI field. Someone who expects the port to persist in the URL will think the edit did not take.
- **It converts lazily.** The hook only fires `if isDirty('fqdn')`, so both shapes coexist until each resource's domain is next saved. There is no bulk migration.

4.3.16 and 4.3.18 extended this to Compose: proxy labels now use **each service's own configured ports**, with the application port only as a fallback, and multi-service Compose domains no longer inherit the application port. A Compose service domain that had no explicit port may now resolve to a different container port than it did before.

### 4.3.19 — Sentinel is mandatory on regular servers

The enable/disable setting is **read-only in both the UI and the API**. Migration `enable_sentinel_for_existing_regular_servers` switches it on for every server that is reachable, usable, not force-disabled, not a build server and not Swarm. Sentinel itself went 0.0.22 → 1.0.1, and 4.3.22 added real-time sync status. A server where Sentinel had been deliberately disabled will have it back on after the upgrade, and it cannot be turned off again.

### 4.3.22 — host-path persistent volumes removed

Host-path configuration is gone from the UI **and** the API; a request carrying `host_path` is now rejected. Scope matters and the release note does not state it: the column still exists on `local_persistent_volumes` and is still consumed at deploy time, so **existing bind mounts keep deploying** — they simply cannot be created or edited through those routes any more. Bind mounts declared in your own `docker-compose.yml` are unaffected, since those come from the file. Any automation that `PATCH`es storage with `host_path` breaks.

### 4.3.15–4.3.21 — the restart-limit episode

A default `max_restart_count` of 10 arrived around 4.3.15 for applications, preview deployments and service applications; databases were exempted in 4.3.17; 4.3.19 added settings and API support; **4.3.21 made limits opt-in, defaulted them to 0 (unlimited), and reset any row still sitting at exactly 10**.

On 4.3.15–4.3.20 a container that restarted ten times was held stopped. That interacts directly with the `restart: unless-stopped` convention in `02-docker-compose.md` and with the deliberately short-lived worker pattern in `05-php-applications.md` §5 — a worker exiting on `--max-time` to pick up a new image could exhaust the cap. Nothing to do on 4.3.21+; worth knowing if you are diagnosing anything that happened in that window.

### 4.3.15 — `COOLIFY_FQDN` / `COOLIFY_URL` with multiple domains

Before 4.3.15 these were computed by calling `getHost()` on the entire comma-separated domain string, so **everything after the first domain was silently dropped**. Fixed in [#11527](https://github.com/coollabsio/coolify/pull/11527): the value is now split, each domain has its port removed, and the list is rejoined. If you have a multi-domain application, the value these variables carry changed.

Separately, and still true: on `compose_parsing_version` 1 or 2 the two variables are **swapped** relative to 3+ — the legacy path puts the bare host in `COOLIFY_URL` and the scheme-qualified URL in `COOLIFY_FQDN`. Pinned by test, so do not expect it to be quietly corrected.

### The helper takes the SSH user's docker config, or none — and 4.3.19 made it bite

**The registry-auth behaviour itself is long-standing, not a 4.3.19 change.** `ApplicationDeploymentJob` resolves the server's home directory over SSH and mounts `$HOME/.docker/config.json` into the helper container — **and if that file does not exist, it starts the helper with no config mount at all, so every registry pull is anonymous.** No warning is logged. (The `private string $serverUserHomeDir = '/root'` default is immediately overwritten on the line that runs and has never been the operative value.)

Verified line-for-line identical at **v4.1.2, v4.3.2, v4.3.18, v4.3.19 and v4.3.22**:

```php
$this->serverUserHomeDir = instant_remote_process(['echo $HOME'], $this->server);
$this->dockerConfigFileExists = instant_remote_process([
    "test -f {$this->serverUserHomeDir}/.docker/config.json && echo 'OK' || echo 'NOK'"
], $this->server);
```

Only the build-server path throws on a missing config; the ordinary path silently omits the mount.

**What 4.3.19 actually changed** is commit `361d5a3c8 feat(deploy): pull compose images before stopping containers`. The image pull moved earlier in the deploy, which is what turns a pre-existing anonymous-pull condition into a visible, deploy-aborting failure. The log line `Pulling image-based services before stopping the current deployment` is absent at 4.3.14 and 4.3.18 and present at 4.3.19 — so its appearance in a deploy log dates the instance.

Symptom, unchanged and still the thing to recognise: a server where someone ran `sudo docker login ghcr.io` (credentials in root's home) while Coolify connects as `ubuntu` fails with `Error error from registry: unauthorized` on the first private image and `Interrupted` on the others. Because the pull now happens before anything stops, the running containers are untouched, the site stays up on the old images, and nothing looks wrong until you check what is deployed. The version jump arrives through Coolify's own auto-update, so it is easy to miss: check `docker inspect coolify --format '{{.Config.Image}} {{.Created}}'` on the control plane.

Fix: `docker login` as the SSH user (no `sudo`), or copy root's config into that user's home, owned by the user, mode 600. Then redeploy. Full detail and the diagnostic path in `07-github-actions-deployment.md` §2 and `08-troubleshooting.md` §2.4.

**Open:** if the config mount has been conditional since at least 4.1.2, what authenticated the pull before 4.3.19? Not established. Candidates: the pull previously ran through a path that reached the daemon's own credentials, or those deploys were never actually pulling a private image. Recorded in §4 of `08-troubleshooting.md` rather than guessed at.

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
- Where a domain is stored for a Compose resource — `applications.fqdn` vs `applications.docker_compose_domains` — and which one the UI writes. Note that `docker_compose_domains` keys changed in 4.3.0 from underscore-normalised names to the original compose service names, with dual-read for the old shape.
- The generated Traefik label set. (`loadbalancer.server.port` *is* emitted, whenever a port resolves — from the domain string on ≤ 4.3.14, from `domain_port_overrides` on 4.3.15+. It is absent only when no port is configured at all.)
- The `applications` table schema.
- Whether the Traefik API is exposed. On 4.1.x it is not (`--api.insecure=false`), so Traefik cannot be asked what it resolved.
- Pre/post-deployment commands and scheduled tasks — availability, and which container they target.
- Whether the compose file is re-read from git on every deploy or served from stored state.

The diagnostics in `08-troubleshooting.md` inspect Docker and Postgres directly rather than Coolify's UI, so they survive version changes better than anything describing Coolify's own behaviour.

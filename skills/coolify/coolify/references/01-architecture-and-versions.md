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
| 4.3.22 | 18 Sep 2026 | **Breaking:** host-path persistent volumes removed from UI and API. **Do not run this version** — see below |
| 4.3.23 | 18 Sep 2026 | Fixes the 4.3.22 health-check regression, 96 minutes later |
| 4.4.0 | 6 Oct 2026 | **Behaviour change:** registry logins in the UI and API; generated container names and `coolify.*` labels renamed; variable-name validation; proxy no longer re-attached to networks hourly; `coolify-realtime` container gone; `read:sensitive` API ability for logs |
| 4.4.4–4.4.5 | 7–9 Oct 2026 | **Do not run** — the `coolify` container fails to start (`s6-overlay … Permission denied`, [#12141](https://github.com/coollabsio/coolify/issues/12141)) |
| 4.4.6 | 9 Oct 2026 | Fixes the 4.4.4 startup failure |
| 4.4.7, 4.3.24, 4.2.1, 4.1.3, 4.0.1 | 21 Oct 2026 | **Security release on every v4 line** — PHP 8.4.27 for PHP2Shell (CVE-2026-109618/109619), cloudflared, Sentinel 1.1.2. Lines before 4.4 update with `curl -fsSL https://cdn.coollabs.io/coolify/patch.sh \| sudo bash`; upstream recommends 4.4.7 or later, since other security fixes were not backported |
| 4.5.0 | 23 Oct 2026 | **Breaking:** compose `scale`/`replicas` > 1 rejected; `POST /enable` removed; more API routes need `deploy`. **Behaviour change:** pre-pull skips locally built images; new variables pass exact values |

The practical consequence: **"Coolify 4" is not a usable version identifier**, and material written before mid-2026 — including most blog posts, most forum answers, and most of a language model's recalled knowledge — describes the beta era. Recalled details about schema columns, API verbs, generated labels and UI locations are frequently wrong.

This is not hypothetical. A query written against `applications.is_container_label_escape_enabled` failed outright — the column is real, but it lives on `application_settings` and `services`, not `applications`:

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
/enable (removed in 4.5.0)  /applications/{uuid}/{start,restart,stop}
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

On save, the port is stripped out of the domain and stored alongside it, and the label generator reads it from there:

```
fqdn "https://host:8080"  →  fqdn "https://host" + domain_port_overrides {"https://host": 8080}
```

Three consequences:

- **A portless domain no longer means "no port configured."** Check `domain_port_overrides` before concluding anything from the domain string alone.
- **Entering `https://host:8080` still works as input**, but the domain will read back portless and the port appears in its own UI field. Someone who expects the port to persist in the URL will think the edit did not take.
- **It converts lazily.** Both shapes coexist until each resource's domain is next saved. There is no bulk migration.

4.3.16 and 4.3.18 extended this to Compose: proxy labels now use **each service's own configured ports**, with the application port only as a fallback, and multi-service Compose domains no longer inherit the application port. A Compose service domain that had no explicit port may now resolve to a different container port than it did before.

### 4.3.19 — Sentinel is mandatory on regular servers

The enable/disable setting is **read-only in both the UI and the API**. Migration `enable_sentinel_for_existing_regular_servers` switches it on for every server that is reachable, usable, not force-disabled, not a build server and not Swarm. Sentinel itself went 0.0.22 → 1.0.1, and 4.3.22 added real-time sync status. A server where Sentinel had been deliberately disabled will have it back on after the upgrade, and it cannot be turned off again.

### 4.3.22 — host-path persistent volumes removed

Host-path configuration is gone from the UI **and** the API; a request carrying `host_path` is now rejected. Scope matters and the release note does not state it: the column still exists on `local_persistent_volumes` and is still consumed at deploy time, so **existing bind mounts keep deploying** — they simply cannot be created or edited through those routes any more. Bind mounts declared in your own `docker-compose.yml` are unaffected, since those come from the file. Any automation that `PATCH`es storage with `host_path` breaks.

### 4.3.15 — `COOLIFY_FQDN` / `COOLIFY_URL` with multiple domains

Before 4.3.15, with more than one domain, **everything after the first was silently dropped**. Fixed in [#11527](https://github.com/coollabsio/coolify/pull/11527). If you have a multi-domain application, the value these variables carry changed.

Separately, and still true: on `compose_parsing_version` 1 or 2 the two variables are **swapped** relative to 3+ — the legacy path puts the bare host in `COOLIFY_URL` and the scheme-qualified URL in `COOLIFY_FQDN`. Pinned by test, so do not expect it to be quietly corrected.

### 4.3.22 only — a healthy container fails its own deployment

**Skip 4.3.22.** It was Latest for 96 minutes before 4.3.23 replaced it, so few instances will have caught it, but the failure is severe and its signature is confusing.

4.3.22 stopped trimming saved command output, so the health-check wait loop never recognises `healthy`: it exhausts every retry and the deploy is treated as unhealthy — while the container is, in fact, healthy. The same bug broke Nixpacks type detection, the commit message recorded against a deployment, and the check that decides whether a file-storage mount is a directory or a file. 4.3.23 fixes it.

Only resources whose health check Coolify waits on are affected, which for Compose resources is most of them (§7 of `02-docker-compose.md`: they inherit the image's `HEALTHCHECK`).

### 4.4.0 — registry logins moved into Coolify

Each server has a **Registries** tab (and `GET`/`POST`/`DELETE /servers/{uuid}/registries`, plus `POST …/registries/{registry}/check`). Login runs `docker --config "$HOME/.docker" login` over the server's SSH session, so it writes **the same file the helper mounts** — the SSH user's — and the token is not stored in Coolify. Two consequences on a non-root server: the command is sudo-wrapped, so the file (and `~/.docker` itself, if it did not exist) is created **as root** inside the SSH user's home, and a later hand `docker login` as that user then fails to write it; and the "used by" column only knows applications with a Docker image name set, so a Compose resource pulling `image:` from a registry is **not** listed as needing it. The check endpoint is the right verification; `07-github-actions-deployment.md` §2.

### 4.4.0 — generated container names and labels changed

Generated names are `<prefix-or-uuid>-<ISO 8601 timestamp>` (`shop-api-20260908T141530`), and Compose services get `<service>-<prefix-or-uuid>-<timestamp>`; the prefix is `custom_container_name_prefix` in the application's container settings, optional, slugified, unique per server. A **custom container name** now means **consistent naming**, which gives up rolling updates — and the upgrade migration switched consistent naming **on** for every application that had a stored custom name with the setting off, so those applications now stop before they start. If deploys gained downtime at 4.4.0, that is why: clear the custom name and use the prefix instead — **unless the resource runs Scheduled Tasks and has more than one container** (§3, 4.5.0: a prefix hides the containers from the task runner). Containers are labelled `coolify.applicationUuid` / `coolify.serviceUuid` / `coolify.databaseUuid` instead of the numeric-ID labels; existing containers gain the new labels on their next deploy.

### 4.4.0 — the proxy is no longer re-attached to networks hourly

Coolify used to reconnect `coolify-proxy` to every Docker network on the hour and on server checks. Now it connects it only when a destination is created, when a resource is deployed, and when the proxy starts or restarts. A missing attachment therefore **persists** until you redeploy the resource or restart the proxy; it no longer heals itself within the hour.

### 4.4.0 — variable names are validated

Names must match `[A-Za-z_][A-Za-z0-9_.]*`. An existing runtime-only variable with another name (`my-var`) still deploys, with a warning and a suggested name; an invalid **build-time** name stops the image build. `03-environment-variables.md` §1.

### 4.4.0 — smaller changes that alter an action

- **`coolify-realtime` is gone.** Realtime runs on Laravel Reverb inside the `coolify` container. Do not diagnose a missing `coolify-realtime` container as a fault.
- **Reading logs through the API needs `read:sensitive`** (`/applications/{uuid}/logs` and the database and service equivalents); `/deployments/{uuid}` still needs only `read`, so CI polling is unaffected. `instant_deploy` needs `deploy`.
- **Server roles.** A server can be *Deployments only*, *Builds only* or both (`server_role` in the API; `is_build_server` still works). A deployments-only server refuses to build and the application needs a Docker image name — except Docker Image and **Docker Compose** applications, which are exempt and still build where they deploy.
- **Multiple servers per application:** additional servers must run the same proxy as the primary and always pull the image the primary pushed; Docker Compose applications and persistent volumes can no longer be combined with multiple servers.
- **Traffic analytics** is a per-server toggle, off by default, and **enabling it restarts the proxy**. Caddy resources need a redeploy afterwards.
- **New volume mounts are named volumes**; existing bind mounts keep their paths, read-only in the UI (continuing 4.3.22).
- **Non-root servers:** several paths that failed when the SSH user could not write `/data/coolify` or enter the proxy directory were fixed, and pipes inside quoted strings (Docker `--format` templates) are no longer rewritten with `sudo`. Coolify now writes files with `sudo tee` over stdin.
- **The Traefik dashboard router** is no longer emitted in new proxy configurations and was removed from saved ones; restart the proxy to apply.

### 4.4.2 — server builds finally keep their layer cache

Up to 4.4.1 the helper's `--add-host` entries changed on every deploy and invalidated the Docker build cache, so a build-on-server deploy was effectively always cold ([#11781](https://github.com/coollabsio/coolify/pull/11781)). Re-measure before optimising a Dockerfile for a cache that only started working at 4.4.2.

### 4.5.0 — Compose `scale` and `replicas` above 1 are rejected

The parser now fails the deploy for any service with `scale` or `deploy.replicas` greater than 1, for applications and one-click services alike. It never worked: Coolify sets a `container_name` on every service, and Compose will not start a second container with the same name. Declare each instance as its own service (`worker1`, `worker2`), sharing a YAML anchor for the environment.

### 4.5.0 — the pre-pull skips locally built images, and custom build commands

The 4.3.19 pre-pull ran `docker compose pull --ignore-buildable`, which only skips services that carry `build:` themselves. A service that **reuses the tag of a built image** — exactly the "one `build:` per image tag" pattern in `02-docker-compose.md` §3 — was pulled too: an unqualified local tag failed the deploy with `pull access denied`, and a registry-qualified tag silently replaced the fresh build with the older registry copy ([#11773](https://github.com/coollabsio/coolify/issues/11773)). Affects 4.3.19–4.4.7; fixed in 4.5.0, which pulls only services whose image comes from neither a `build:` nor another service's build.

4.5.0 also **skips the pre-pull entirely when the resource has a custom build command** (without a build server), because such a command can build images Compose does not know about. For a resource that has a custom build command *and* pulls registry images, the pre-4.3.19 stale-`latest` problem is back — `02-docker-compose.md` §8B.

### 4.5.0 — new variables reach the container exactly as entered

Variables now reach the container with no added escaping: up to 4.4.x Coolify backslash-escaped quotes and backslashes (and quoted literal and multiline values), so the container could see a value with extra backslashes or quotes ([#12024](https://github.com/coollabsio/coolify/pull/12024)). The upgrade marks **every existing variable** as legacy, and they keep the old escaping so running containers see no change; only variables **created** on 4.5.0+ use exact values. Editing an existing variable does not convert it — the UI shows an **Old escaping** warning on any variable whose value differs, and the fix is to delete and re-add it, then restart. If that value is a database password, change it in the database too.

The **Literal** flag still matters under exact escaping: a non-literal value still allows Compose `$VAR` interpolation. `03-environment-variables.md` §5.

### 4.5.0 — API abilities

- `POST /api/v1/enable` is gone. `/disable` remains.
- Tokens need the **`deploy`** ability, not only `write`, to execute scheduled tasks, restart the proxy, change Sentinel or log drains, log in to a server registry (`POST /servers/{uuid}/registries`), run Docker cleanup, import a server, and delete applications, databases, services or previews.
- Backup execution messages are hidden unless the token has `read:sensitive` or `root`.
- `/deploy` and `/deployments/{uuid}` are unchanged — a CI token with `deploy` and `read` keeps working.

### 4.5.0 — Scheduled Tasks and container name prefixes

Scheduled tasks now run only in **running** containers (a stopped container from a rolling update was a candidate before) and skip a run while the previous run is still going.

Read in source at 4.5.0, not observed on a running instance: the task runner finds a Compose service's container by the name prefix `<service>-<resource-uuid>`, or takes the only container if there is just one. A **`custom_container_name_prefix`** (4.4.0) replaces the UUID in the generated name, so on a resource with more than one container the task matches nothing and fails with `No valid container was found. Is the container name correct?`. Do not set a prefix on a resource that runs scheduled tasks. Present since 4.4.0.

### 4.5.0 — smaller changes that alter an action

- **Coolify backs up its own database before an update**, on by default (`is_backup_before_update_enabled`).
- **Rollback can pull registry images** of the last ten successful deployments — but only for applications with a Docker image name set, and **not for the Docker Compose build pack**. For Compose, rollback is still repointing the image tag (`07-github-actions-deployment.md` §1).
- **Gitea App sources** join GitHub and GitLab; GitLab can deploy from one system hook rather than a webhook per project.
- **Plaintext secrets encrypted at rest** (Git-source and server-setting secrets, among others). A query against Coolify's Postgres that read one of those columns now returns ciphertext.
- **One-click services connect to the predefined network before their containers start** (not after, where a crash-looping container silently missed the connect). Applications are unchanged.
- **Traefik 3.7.16** (and 2.11.60).

### The helper takes the SSH user's docker config, or none — and 4.3.19 made it bite

**The registry-auth behaviour itself is long-standing, not a 4.3.19 change.** `ApplicationDeploymentJob` resolves the server's home directory over SSH and mounts `$HOME/.docker/config.json` into the helper container — **and if that file does not exist, it starts the helper with no config mount at all, so every registry pull is anonymous.** No warning is logged.

Verified line-for-line identical at **v4.1.2, v4.3.2, v4.3.18, v4.3.19, v4.3.22, v4.4.6 and v4.5.0**. Only the build-server path throws on a missing config; the ordinary path silently omits the mount. 4.4.0's Registries tab writes exactly this file (above).

**What 4.3.19 actually changed** is commit `361d5a3c8 feat(deploy): pull compose images before stopping containers`. The image pull moved earlier in the deploy, which is what turns a pre-existing anonymous-pull condition into a visible, deploy-aborting failure. The log line `Pulling image-based services before stopping the current deployment` is absent at 4.3.14 and 4.3.18 and present at 4.3.19 — so its appearance in a deploy log dates the instance. Its absence no longer does: from 4.5.0 it is logged only when the compose file has registry-image services and no custom build command (§3, 4.5.0).

Symptom, unchanged and still the thing to recognise: a server where someone ran `sudo docker login ghcr.io` (credentials in root's home) while Coolify connects as `ubuntu` fails with `Error error from registry: unauthorized` on the first private image and `Interrupted` on the others. Because the pull now happens before anything stops, the running containers are untouched, the site stays up on the old images, and nothing looks wrong until you check what is deployed. The version jump arrives through Coolify's own auto-update, so it is easy to miss: check `docker inspect coolify --format '{{.Config.Image}} {{.Created}}'` on the control plane.

Fix: a login written to the SSH user's `~/.docker/config.json` — `docker login` as that user, or `sudo docker --config /home/<user>/.docker login` when that user is not in the `docker` group — owned by the user, mode 600; or copy root's config there. Then redeploy. Full detail and the diagnostic path in `07-github-actions-deployment.md` §2 and `08-troubleshooting.md` §2.4.

**Why it worked before** is an open question with a leading, unconfirmed explanation and a test that would settle it: §4 of `08-troubleshooting.md`.

**What is confirmed is that there are two credential contexts, and they differ.** Verified in source at 4.3.23 and unchanged at 4.4.6 and 4.5.0:

- The deploy's pre-pull runs **inside the helper**, which mounts the SSH user's `~/.docker/config.json` at `/root/.docker/config.json`, so it uses the **SSH user's** login. So does the deploy's `docker compose up` — **by default**. Two resource settings move that `up` onto the host: **Preserve repository during deployment**, and **raw compose deployment** without a custom start command (raw compose *with* a custom start command stays in the helper). The deploy log shows which ran: the helper form is prefixed `docker exec <helper>`, the host form is `sudo … docker compose --env-file /data/coolify/applications/<uuid>/.env --project-directory /data/coolify/applications/<uuid> … up -d`.
- Every host-side `docker compose up -d` — restart, start-after-stop, service deploy, auto-start after a reboot, and the two deploy cases above — is sudo-wrapped whenever the server is non-root, so it reads **root's** `~/.docker/config.json`.
- Build-server deploys run on the host too, and Coolify passes `up --pull always` explicitly, so they pull as root whatever the compose file says.

Observed consequence: with the login configured for the SSH user only, a private image pulls successfully during deploy and then fails `unauthorized` a few steps later, on the same image, as soon as something host-side is made to pull. `pull_policy: always` is what usually makes it pull — which is why that rule inverted at 4.3.19. With preserve-repository on, "a few steps later" is the same deploy: the pre-pull succeeds and the host-side `up -d` fails (observed on 4.3.23). See `02-docker-compose.md` §8B.

## 4. What Coolify actually is

### Control plane

One host runs the Coolify application itself, as a set of containers:

| Container | Role |
| --- | --- |
| `coolify` | The Laravel application and UI |
| `coolify-db` | Postgres; user and database are both `coolify` |
| `coolify-redis` | Queues and cache |
| `coolify-realtime` | WebSocket push for the UI — **gone since 4.4.0**, when realtime moved inside the `coolify` container (Laravel Reverb) |
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

- **Nixpacks is in maintenance mode.** Railway, its maker, states in the project README: "This project is currently in maintenance mode and is not under active development. We recommend using Railpack as a replacement." It still works, but it is not gaining new language/version support, and since **4.5.0** Coolify itself marks it deprecated in the UI and recommends Railpack.
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

# Docker Compose Resources in Coolify

The Docker Compose build pack is the right choice for any application that is more than one container, or that needs precise control over its image. This file describes what Coolify does with your compose file and the rules that follow.

## 1. What Coolify does on every deploy

Coolify **does not simply run your `docker-compose.yml`.** It parses it, rewrites it, merges its own state in, and runs the result:

1. Clones the repository into a helper container (`ghcr.io/coollabsio/coolify-helper`) on the application server.
2. **Appends `ARG` declarations to your Dockerfile** — one per environment variable it knows about, injected into *every* build stage. A 22-line `ARG` block landing in both stages of a two-stage Dockerfile is normal.
3. **Re-serialises your compose file.** This **drops all comments** and normalises quoting.
4. Merges in: `container_name`, its own `labels` (`coolify.*` plus generated `traefik.*` / `caddy_*`), `networks` (one external network named after the resource UUID), `env_file: .env`, and its own environment variables.
5. Renames volumes to `<resource-uuid>_<your-volume-name>`.
6. Runs the build and start commands, which default to `docker compose build` and `docker compose up -d` and are editable in the UI.

Consequences to internalise:

- **The compose file you wrote is an input, not the artefact.** Debug the artefact — `docker inspect` on the running container.
- **Comments never reach the server.** Never test whether Coolify has your latest compose by grepping its stored copy for a string that only appears in a comment. That produces a confident false negative.
- Because Coolify appends `ARG`s, build-arg behaviour can differ from a local `docker build`.
- The UI's **"Show Deployable Compose"** preview *generates* labels for display. It is not proof of what deployed.

## 2. Configuration in the UI

| Setting | Meaning |
| --- | --- |
| **Base Directory** | Root path within the repo. `/` for a root-level compose file, `/backend` for a subfolder |
| **Docker Compose Location** | Path to the file, extension included and exact (`.yml` vs `.yaml` matters) |
| **Branch** | Detected from the repository |
| **Custom build command** | Overrides `docker compose build` |
| **Custom start command** | Overrides `docker compose up -d` |
| **Raw compose deployment** | Skips Coolify's modifications entirely. Advanced; you then own labels and networks |

## 3. Hard rules

### Never define custom networks

Coolify generates an isolated bridge network per stack and attaches the proxy to it. Service names resolve as hostnames within it (`http://backend:8080`).

Defining your own `networks:` puts containers on two networks, and Traefik then picks non-deterministically — producing **intermittent** HTTPS outages that look like an infrastructure fault. Upstream documents this explicitly. Do not do it.

For deliberate cross-stack connectivity, use **Connect to Predefined Network** in the resource's configuration instead. See `04-shared-infrastructure.md`.

### Never publish ports on a proxied service

```yaml
# WRONG for anything behind the proxy
ports:
  - "8080:80"
```

A published port bypasses Traefik, binds the container to the host interface, and destroys the "the proxy is the only route in" assumption that makes trusting `X-Forwarded-*` headers safe. Let the proxy reach the container on the internal network.

`expose:` is inert when the image already declares the port, and cannot *reduce* what the image exposes. Working Coolify examples omit it.

### One `build:` per image tag

Two services sharing an `image:` tag while each carrying `build:` fails at export under buildx bake:

```
image "docker.io/library/<tag>": already exists
```

Both builds succeed and produce a byte-identical image; only the naming collides. Plain `docker compose build` without bake deduplicates and hides this, so it does not reproduce locally unless `COMPOSE_BAKE=true`.

The fix is to build once and reference the same tag from the other services:

```yaml
services:
  web:
    build: .
    image: myapp:latest
  worker:
    image: myapp:latest        # no build: here
    command: php artisan queue:work
```

### Keep service names simple

Lowercase, no dots, ideally no hyphens: `web`, `worker`, `redis`, `solr`. Coolify 4.3.0 shipped fixes for compose domains, environment variables and proxy router names on service names containing dots or hyphens — evidence that this is a rough edge. A hyphen is tolerable; a dot is asking for trouble.

## 4. Domains and routing

A Compose resource stores per-service domains in `applications.docker_compose_domains`, as JSON:

```json
{"web": {"domain": "https://app.example.com"}}
```

Two ways to set it:

1. **In the UI**, on the service, as a domain. This is what most working resources do.
2. **Via a magic variable** in the compose file — `SERVICE_FQDN_WEB` — which declares that the service has a domain.

**A missing domain produces no Traefik labels at all, and therefore no router.** This is the single most common cause of `503 no available server`. Confirm with the label count check in `08-troubleshooting.md`.

The magic variable is optional; plenty of working resources have none and set the domain purely in the UI. Its presence or absence is therefore not, by itself, an explanation for anything.

**Observed once, cause unestablished:** a resource's domain was found blank where it had previously been set and working. The only plausible link was that `SERVICE_FQDN_<SVC>_<PORT>` had been removed from the compose file shortly before. Unconfirmed, but worth knowing when a domain appears to have emptied itself.

**Multi-port images.** Traefik infers the backend port from the image's exposed ports and cannot do so unambiguously when there is more than one. If labels are present and routing still fails, set the domain to `https://host:80` so Coolify emits an explicit `loadbalancer.server.port`. Note that a *working* Coolify app normally has **no** such label, so its absence proves nothing.

## 5. Magic environment variables

Coolify generates values for variables matching `SERVICE_<TYPE>_<IDENTIFIER>`, writes them into the container environment, and shows them in the UI. Generated secrets are created once and stay stable across redeploys.

| Pattern | Produces |
| --- | --- |
| `SERVICE_FQDN_<ID>` | FQDN derived from the generated URL |
| `SERVICE_URL_<ID>` | Full URL based on the instance wildcard domain |
| `SERVICE_NAME_<ID>` | Service name identifier — useful when preview deployments vary the name |
| `SERVICE_PASSWORD_<ID>` | Random 16-character string |
| `SERVICE_PASSWORD_64_<ID>` | Random 64-character string, no symbols |
| `SERVICE_PASSWORDWITHSYMBOLS_<ID>` | As above, with symbols (`_64` variant too) |
| `SERVICE_USER_<ID>` | Random 16-character string |
| `SERVICE_BASE64_<ID>` | Random 32-character string (`_32`, `_64`, `_128`) — *not* actually base64 |
| `SERVICE_REALBASE64_<ID>` | Genuinely base64-encoded (`_32`, `_64`, `_128`) |
| `SERVICE_HEX_<ID>` | Hexadecimal string (`_32`, `_64`, `_128`) |

Syntax notes:

- **Port suffix:** `SERVICE_URL_APP_3000` targets port 3000.
- **Because the port is appended after an underscore, an identifier that needs a port must use hyphens internally** — `SERVICE_URL_MY-APP_3000`, not `SERVICE_URL_MY_APP_3000`.
- **Path suffix:** assign a path to append it — `SERVICE_URL_APP=/v1/realtime`.
- Reusing the same identifier across services yields the same value, which is how you hand a generated password to both a database and its client.
- All generated variables appear in the UI and are editable, except FQDN and URL.

Coolify also injects these into every container:

```
COOLIFY_FQDN, COOLIFY_URL, COOLIFY_BRANCH, COOLIFY_RESOURCE_UUID, COOLIFY_CONTAINER_NAME
SOURCE_COMMIT
SERVICE_FQDN_<SVC>, SERVICE_URL_<SVC>, SERVICE_NAME_<SVC>
SERVICE_PASSWORD_<ID>, SERVICE_PASSWORD_64_<ID>
```

`COOLIFY_FQDN` **is** available inside the container, not only to compose interpolation — a widely repeated claim to the contrary is wrong on current versions. Even so, **declare it explicitly** so the dependency is visible in your file and the stack still works under plain `docker compose`:

```yaml
environment:
  - COOLIFY_FQDN=${COOLIFY_FQDN:-}
```

## 6. Volumes and storage

- Named volumes are renamed to `<resource-uuid>_<name>`. Do not hard-code the prefixed name anywhere.
- The base directory inside a container is `/app` by Coolify convention; mount below it (`/app/storage`, `/app/web/sites/default/files`).
- Bind mounts reference host paths directly and are added through the UI's storage settings.
- Coolify compose extensions on a volume entry:
  - `is_directory: true` — create an empty directory rather than a file.
  - `content: |` — create a file with the given inline content.
- 4.2.0+ supports **scheduled backups of persistent volumes and directory mounts** to local or S3-compatible storage, with retention. Use it rather than writing your own volume-backup cron.
- Mounting the *same file* into multiple containers is explicitly not recommended without file locking.

## 7. Health checks

- Health checks come from the image's `HEALTHCHECK`, or from the `healthcheck:` block in the compose file. For compose resources these are the only options — the UI's path-based health check applies to single-container applications.
- A Dockerfile `HEALTHCHECK` **overrides** a UI-configured one.
- Traefik routes only to healthy containers when health checks are enabled. Failing checks surface as `404 Not Found` or `no available server`.
- `exclude_from_hc: true` on a service removes it from Coolify's health aggregation.
- **Any service that does not listen on a port still inherits the base image's `HEALTHCHECK`.** A cron sidecar or one-shot built `FROM` a web image reports `unhealthy` for its entire life while working perfectly. Disable it:

  ```yaml
  worker:
    healthcheck:
      disable: true
  ```

Writing a health check that does not lie: `05-php-applications.md` §4.

## 8. Two compose shapes

### A. Built on the Coolify server

```yaml
services:
  web:
    build:
      context: .
    restart: unless-stopped
    environment:
      - APP_ENV=${APP_ENV:-production}
    volumes:
      - app-storage:/app/storage

volumes:
  app-storage:
```

Build time *is* deploy time, and the server's layer cache is the only thing between a code change and a full dependency install.

### B. Image built in CI, pulled from a registry

```yaml
services:
  web:
    image: ghcr.io/<org>/<repo>:latest
    pull_policy: always          # required — see below
    restart: unless-stopped
    environment:
      - APP_ENV=${APP_ENV:-production}
    volumes:
      - app-storage:/app/storage

  worker:
    image: ghcr.io/<org>/<repo>:latest
    pull_policy: always
    restart: unless-stopped
    command: php artisan queue:work --tries=3 --timeout=90
    healthcheck:
      disable: true

volumes:
  app-storage:
```

**`pull_policy: always` is not optional in this shape.** Without it, a redeploy that finds a local image tagged `latest` will use the stale one, and the deploy will appear to succeed while shipping nothing. See `07-github-actions-deployment.md` for the registry side, including the `docker login` that must be run on the server.

### C. Single service, compiled binary — the minimal case

Nothing here is PHP-specific. A Go, Rust, or Node service reduces to one service and one health check:

```yaml
services:
  app:
    image: ghcr.io/<org>/<repo>:latest
    pull_policy: always
    restart: unless-stopped
    environment:
      - ENVIRONMENT=${ENVIRONMENT:-production}
      - PORT=${PORT:-8080}
      - LOG_LEVEL=${LOG_LEVEL:-info}
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:${PORT:-8080}/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
```

Two things to note:

- **`PORT` is one of Coolify's predefined variables**, defaulting to the image's first exposed port; `HOST` defaults to `0.0.0.0`. Reading `PORT` from the environment rather than hard-coding a listen port is the convention, and it keeps the compose file, the health check and the image consistent.
- Pick a health-check tool the image actually has. `wget --spider` is right for Alpine; `curl -f` needs `curl` installed, which minimal and distroless images do not have. Where neither exists, add a tiny health command to the binary itself and use `test: ["CMD", "/app/main", "healthcheck"]`.

### Verifying any of these locally

Because there is no `ports:` mapping, `docker compose up` alone gives you nothing to connect to. Publish the port explicitly for the local run only:

```sh
docker compose run --rm -p 8080:8080 app     # pull and run the registry image
docker build -t myapp:local . && docker run -p 8080:8080 -e ENVIRONMENT=production myapp:local
```

Never "fix" this by adding `ports:` to the committed file.

## 9. Build performance on the Coolify server

Relevant only to shape A, but it is where deploy time goes.

- **A multi-stage split can be net-negative.** Isolating `composer install` in its own stage to key it on `composer.json`/`composer.lock` costs a cross-stage `COPY --from` of the whole tree. Measured on a real host: **41.7s for the copy against the 14.0s install it protected** — every cold build ~42s slower to save ~12s on a warm one. Prefer a cache mount:

  ```dockerfile
  RUN --mount=type=cache,target=/root/.cache/composer \
      composer install --no-dev --optimize-autoloader --no-interaction
  ```

- **Recursive `chmod`/`chown` over a large tree is brutal on network-backed storage.** `chmod -R a+rX /app` over ~24,000 files took **243 of ~370 seconds**, and re-ran on every deploy because the `COPY` above it invalidated the layer.
- And it is usually pointless here: the build context is a **fresh `git clone`**, and git records only the executable bit, so every file arrives at the umask default. Restrictive modes can only come from a local working tree. Use `COPY --chown=` instead of a post-hoc recursive chown.

## 10. Review checklist

- [ ] No `networks:` block
- [ ] No `ports:` on any proxied service
- [ ] At most one `build:` per `image:` tag
- [ ] Service names lowercase, no dots
- [ ] `pull_policy: always` on every registry-image service
- [ ] `restart: unless-stopped` on long-lived services
- [ ] `healthcheck: {disable: true}` on workers and sidecars that do not listen
- [ ] Every operator-tunable value written as `${VAR:-default}` (see `03-environment-variables.md`)
- [ ] Volumes named plainly, mounted under `/app`
- [ ] No secrets literal in the file
- [ ] `docker compose config` parses, run as its own step

# PHP Applications on Coolify

Covers PHP generally, FrankenPHP and php-fpm, and Laravel specifics. Drupal has its own file: `06-drupal.md`.

## 1. Image choice and the runtime split

| Runtime | Notes |
| --- | --- |
| **FrankenPHP** (`dunglas/frankenphp`, or a distribution image built on it) | One process; Caddy *is* the PHP runtime. No fpm/webserver split, no `clear_env` problem, TLS and HTTP/2–3 built in. The current default choice |
| **php-fpm + nginx/Caddy** | Two containers or a supervisord image. More moving parts; the environment-variable handling below matters more |
| **Apache + mod_php** | Works; nothing Coolify-specific |

### FrankenPHP specifics

- `getenv()` works with no configuration, because there is a single process and no fpm environment sanitisation.
- FrankenPHP populates `$_ENV`, which php-fpm generally does not (`variables_order` is typically `GPCS`, no `E`). Code that reads `$_ENV` may behave differently here than it did under fpm — usually by *finding* a variable it previously missed. See `03-environment-variables.md` §7.
- **`memory_limit` must not go in `conf.d`.** PHP scans `conf.d` for the CLI SAPI too, and it beats `php-cli.ini`, so a web-oriented limit silently caps every CLI run — `drush`, `artisan`, `composer`. Put the web limit in the Caddyfile:

  ```
  php_server {
      php_ini memory_limit 256M
  }
  ```
- The binary carries `cap_net_bind_service`, so it can run as `www-data` and still bind port 80. Upstream images do not do this by default; doing it is worth the small effort.
- **Do not set `trusted_proxies` in the Caddyfile behind Coolify.** Caddy would then resolve the remote host from `X-Forwarded-For`, making `REMOTE_ADDR` the *client's* address. Application configurations commonly do `reverse_proxy_addresses = [$_SERVER['REMOTE_ADDR']]`, which would then trust the client and let it spoof its own `X-Forwarded-Proto`.

A minimal Caddyfile for a `public/`-rooted framework:

```
{
	frankenphp
	order php_server before file_server
}

:80 {
	root * /app/public
	encode zstd br gzip
	php_server
}
```

With `ENV SERVER_NAME=":80"` in the Dockerfile. Coolify's Traefik terminates TLS; the container speaks plain HTTP on the internal network.

### php-fpm specifics

- `clear_env = no` in the pool configuration, or the container's environment never reaches PHP.
- Keep `variables_order` in mind before writing code that reads `$_ENV`.

## 2. Dockerfile patterns

```dockerfile
# Stage 1 — frontend assets
FROM node:24-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2 — runtime
FROM dunglas/frankenphp:1-php8.5-bookworm
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

RUN install-php-extensions pdo_mysql redis opcache pcntl intl zip bcmath gd

WORKDIR /app
COPY --chown=www-data:www-data . /app
COPY --from=frontend --chown=www-data:www-data /app/public/build /app/public/build

RUN --mount=type=secret,id=COMPOSER_AUTH,required=false \
    --mount=type=cache,target=/root/.cache/composer \
    if [ -f /run/secrets/COMPOSER_AUTH ]; then \
      AUTH="$(cat /run/secrets/COMPOSER_AUTH)"; \
      case "$AUTH" in \
        \{*) export COMPOSER_AUTH="$AUTH" ;; \
        *)   export COMPOSER_AUTH="{\"github-oauth\":{\"github.com\":\"$AUTH\"}}" ;; \
      esac; \
    fi && \
    composer install --no-dev --optimize-autoloader --no-interaction

COPY Caddyfile /etc/caddy/Caddyfile
ENV SERVER_NAME=":80"
```

Points worth keeping:

- **Private Composer packages** come in through a BuildKit secret, never a build `ARG` — an `ARG` is recorded in image metadata. The `case` handles both a bare token and a full `COMPOSER_AUTH` JSON document, so the same secret works whichever form the operator supplies.
- **A cache mount beats a dependency-only stage.** Splitting `composer install` into its own stage to key it on `composer.json`/`composer.lock` costs a cross-stage `COPY --from` of the whole tree; measured on a real host that copy took 41.7s to protect a 14.0s install. `--mount=type=cache` gets the same download saving for nothing.
- **`COPY --chown=` rather than a recursive `chown` afterwards.** A recursive `chmod`/`chown` over a large PHP tree took 243 of 370 seconds on network-backed storage, and re-ran on every deploy because the `COPY` above it invalidated the layer.
- Coolify appends its own `ARG` block to **every stage** of this file. Do not be surprised by build args you did not declare.

## 3. Laravel

### Configuration cache versus Coolify's variable store

`php artisan config:cache` compiles `config/*.php` — including every `env()` call — into `bootstrap/cache/config.php`. After that, **`env()` returns null outside config files, and changing a variable in Coolify has no effect until the cache is rebuilt.**

Two workable positions:

- **Cache, and rebuild on every deploy.** Put `config:cache` in the post-deployment command. This is the fast, standard choice.
- **Do not cache configuration.** Slower per request, but a variable change in the UI plus a restart is enough.

Never mix them: caching at build time and then changing variables at runtime is the failure mode that produces "I changed it in Coolify and nothing happened".

A post-deployment command that covers the usual ground:

```sh
php artisan migrate --force \
  && php artisan storage:link \
  && php artisan config:cache \
  && php artisan route:cache \
  && php artisan view:cache
```

Set it in **Application Settings → Post Deployment Command**. Note that it runs as the container's own user, not root.

### APP_KEY

`APP_KEY` must be a real value, must be stable across deploys, and must never be generated during the build — a fresh key per build invalidates every encrypted cookie and session. Set it once in Coolify as `${APP_KEY}` with no default.

### Queue workers

A worker is a second service on the same image:

```yaml
worker:
  image: ghcr.io/<org>/<repo>:latest
  pull_policy: always
  restart: unless-stopped
  command: php artisan queue:work --tries=3 --timeout=90 --max-time=3600
  healthcheck:
    disable: true
```

- `healthcheck: disable: true` is required. The worker inherits the web image's `HEALTHCHECK`, does not listen on the port, and would otherwise report `unhealthy` forever while working perfectly.
- `--max-time` lets the process exit periodically so `restart: unless-stopped` picks up a new image after a deploy; without it a long-lived worker can keep running stale code.
- The worker needs the **same environment variables** as the web service. Duplicating the block is verbose but explicit; a YAML anchor (`x-app-env: &app-env`) is the tidier option and Compose resolves it before Coolify sees it.
- If cache and queue share a Redis with `allkeys-lru`, queued jobs can be evicted. See `04-shared-infrastructure.md` §5.

### Scheduler

Prefer Coolify's **Scheduled Tasks** (a cron expression against a named container) over a sidecar running `cmd; sleep 60` in a loop. The trade is explicitness — the schedule then lives in the UI rather than in the repository, so leave a comment in the compose file naming what runs outside it.

### Sessions

`SESSION_DRIVER=database` or `redis`. `file` breaks the moment there is more than one container, and breaks silently on redeploy since the filesystem is ephemeral. If Redis, see the eviction warning above.

### Behind the proxy

Trust the proxy explicitly — Laravel 11+ does this in `bootstrap/app.php`:

```php
->withMiddleware(function (Middleware $middleware) {
    $middleware->trustProxies(at: '*');
})
```

`at: '*'` is safe **only** because the container is unreachable except through Traefik. That is exactly why `ports:` must not appear in the compose file (`02-docker-compose.md` §3). Also set `SESSION_SECURE_COOKIE=true`, since TLS terminates at the proxy and the app would otherwise see plain HTTP.

## 4. Health checks that do not lie

Getting this wrong is the most common self-inflicted PHP deployment failure on Coolify. Traefik routes only to healthy containers, so a check that fails for a benign reason takes the site down.

**Send a real `Host` header.** `curl http://127.0.0.1/` sends `Host: 127.0.0.1`, which fails a `trusted_host_patterns` check outright, and in a multisite setup matches no configured host.

**Accept more than 200:**

| Status | When it is correct |
| --- | --- |
| `200` | Normal |
| `302` | Application redirecting to an installer or a login — normal on an empty database |
| `401` | HTTP basic auth is enabled and working |
| `403` | An installer or admin path is deliberately blocked |

A check that rejects `302` can never pass before the database is imported. The first deploy is then marked failed and the container you need in order to import the database is reported broken.

**Put the logic in a script inside the image**, not a `CMD-SHELL` one-liner. Resolving a hostname from a precedence chain, inside a YAML string, inside Compose's `$$` escaping, is three layers of quoting and it will be got wrong.

```dockerfile
COPY docker/healthcheck.sh /usr/local/bin/healthcheck
RUN chmod +x /usr/local/bin/healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD ["/usr/local/bin/healthcheck"]
```

```sh
#!/bin/sh
# healthcheck.sh — accept any response that proves PHP is executing
HOST="${HEALTHCHECK_HOST:-${COOLIFY_FQDN%%,*}}"
HOST="${HOST:-localhost}"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" "http://127.0.0.1:${PORT:-80}/")
case "$CODE" in
  200|301|302|401|403) exit 0 ;;
  *) echo "unexpected status $CODE for Host: $HOST"; exit 1 ;;
esac
```

Set a `start-period` long enough for a cold opcache and any boot-time work. Deploys fail spuriously without it.

## 5. Files and persistence

Everything written at runtime must be on a volume, or it disappears on redeploy:

```yaml
volumes:
  - app-uploads:/app/storage/app/public   # Laravel
  - app-private:/app/private_files        # anything not web-accessible
```

- Do **not** put the framework's cache or compiled-view directories on a volume. They belong to the image and a stale volume copy will outlive a deploy.
- `php artisan storage:link` must run after deploy, since the symlink lives in `public/` which comes from the image.
- Coolify 4.2.0+ can back volumes up on a schedule. Turn it on for anything holding user uploads.

## 6. Review checklist

- [ ] Runtime chosen deliberately; `clear_env = no` if php-fpm
- [ ] `memory_limit` not placed in `conf.d` on FrankenPHP
- [ ] `trusted_proxies` not set in the Caddyfile
- [ ] Private-package credentials come through a BuildKit secret, not an `ARG`
- [ ] Composer install uses a cache mount, not a dependency-only stage
- [ ] `APP_KEY` stable, supplied by Coolify, never generated at build
- [ ] Config cache rebuilt post-deploy, or not used at all
- [ ] Workers have `healthcheck: {disable: true}` and the same environment as the web service
- [ ] Session driver is not `file`
- [ ] Health check sends a real `Host` header and accepts 302/401/403
- [ ] Runtime-written paths are on volumes; build artefacts are not

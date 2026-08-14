# Environment Variables and Coolify Conventions

Coolify applications are 12-factor applications: configuration lives in the environment, not in the image and not in committed files. The Coolify-specific part is *how you have to write it* so the platform recognises a setting as operator-editable.

## 1. The core convention

**Coolify discovers a Compose resource's environment variables by parsing the `environment:` blocks of your compose file on first deploy.** A value written as a literal is baked in and invisible to the operator; a value written in interpolation form becomes an editable record in Coolify's UI.

```yaml
services:
  web:
    environment:
      # Editable in the UI, safe default if unset — the normal case
      - DB_HOST=${DB_HOST:-127.0.0.1}
      - DB_PORT=${DB_PORT:-3306}
      - LOG_LEVEL=${LOG_LEVEL:-info}

      # Editable, required, no sensible default — deploy should fail loudly without it
      - APP_KEY=${APP_KEY}

      # Editable, defaults to empty — an optional integration
      - SENTRY_DSN=${SENTRY_DSN:-}

      # Deliberately NOT operator-editable
      - APP_ENV=production
```

Rules of thumb:

- **`${VAR:-default}`** for anything with a reasonable default. This is the default choice.
- **`${VAR}`** for required secrets with no safe fallback (`APP_KEY`, `HASH_SALT`). Do not invent a default for a secret; a fabricated default that "works" is worse than a failure.
- **`${VAR:-}`** for optional values. Then make the application treat empty as absent — see §7.
- **A literal** only when the value must not vary by environment.
- Prefer the list form (`- KEY=${KEY:-x}`) or the mapping form consistently within a file; do not mix.

Keep `.env.example` in exact key-parity with the union of your `environment:` blocks. It is the only documentation of what the operator must set, and it is what makes the stack runnable under plain `docker compose` outside Coolify.

## 2. The variable store drifts from your compose file

Coolify parses `environment:` on first deploy and creates **its own** environment-variable records. Those records **persist independently of the file**:

- Removing a variable from the compose file in git does **not** remove it from the resource.
- Values first parsed from an early revision keep appearing in the deployable compose long after they were deleted from the repo.
- Editing a value in the UI does not write back to git.

Practical guidance:

- Treat the compose file as the *declaration* of which variables exist, and the UI as the *source of values*.
- After removing a variable from the compose file, delete it in the UI too, or via `DELETE /api/v1/applications/{uuid}/envs/{env_uuid}`.
- When a value in a running container does not match anything in the repo, this is why. Check the UI and the database before assuming a deploy did not happen.

## 3. Build-time versus runtime

Each variable carries two independent flags:

| Configuration | During build | In the running container |
| --- | --- | --- |
| Build + Runtime (default) | available | available |
| Build only | available | not available |
| Runtime only | not available | available |

- Build variables are injected as `ARG` instructions. Coolify **appends an `ARG` line per known variable to every stage of your Dockerfile**, which is why a two-stage build sees them in both stages.
- Runtime variables are written to a `.env` file that Coolify mounts and Compose loads via the `env_file:` it merges in.

**Do not mark secrets as build variables** unless the build genuinely needs them. If it does — a private Composer or npm registry token, for instance — enable **"Use Docker Build Secrets"**, which mounts the value via BuildKit instead of embedding it in image layers and metadata. In your Dockerfile:

```dockerfile
RUN --mount=type=secret,id=REGISTRY_TOKEN,required=false \
    if [ -f /run/secrets/REGISTRY_TOKEN ]; then \
      export TOKEN="$(cat /run/secrets/REGISTRY_TOKEN)"; \
    fi && \
    ./install-dependencies.sh
```

## 4. Shared variables

Values can be defined once and referenced from many resources at three levels:

```
{{team.VAR_NAME}}
{{project.VAR_NAME}}
{{environment.VAR_NAME}}
```

Use them in a resource's variable value, e.g. set the resource's `DB_PASSWORD` to `{{project.SHARED_DB_PASSWORD}}`. This is the right way to hand a shared database credential to several applications without copying the secret into each one — see `04-shared-infrastructure.md`.

They are manageable through the API too: `/team/envs`, `/projects/{uuid}/envs`, `/projects/{uuid}/environments/{name}/envs`.

## 5. Value options

- **Multiline** — preserves line breaks. Required for SSH keys, TLS certificates, and inline config blobs.
- **Literal** — suppresses interpolation, so `$` and other shell-special characters survive verbatim. Needed for bcrypt hashes, regexes containing `$`, and passwords with `$` in them. A password that mysteriously loses everything after a `$` is a missing literal flag.

## 6. Predefined variables

Available to every application without declaring them:

| Variable | Value |
| --- | --- |
| `COOLIFY_FQDN` | The application's fully qualified domain name(s) |
| `COOLIFY_URL` | The application's URL(s) |
| `COOLIFY_BRANCH` | Branch name of the deployed source |
| `COOLIFY_RESOURCE_UUID` | Coolify's identifier for the resource |
| `COOLIFY_CONTAINER_NAME` | Generated container name |
| `SOURCE_COMMIT` | Commit hash of the deployed source |
| `PORT` | Defaults to the image's first exposed port |
| `HOST` | Defaults to `0.0.0.0` |
| `SERVICE_NAME_<ID>` | Service name — useful when preview deployments vary it |

`COOLIFY_FQDN` is genuinely present inside the container, not only during compose interpolation. Nonetheless declare it explicitly in your own `environment:` block so the dependency is visible and the stack works under plain `docker compose`:

```yaml
environment:
  - COOLIFY_FQDN=${COOLIFY_FQDN:-}
  - SOURCE_COMMIT=${SOURCE_COMMIT:-}   # useful as a release identifier for error tracking
```

Magic `SERVICE_*` generators (passwords, users, base64, hex, FQDN, URL) are documented in `02-docker-compose.md` §5.

## 7. Traps

### Empty is not absent

**Treat a set-but-empty variable as absent when resolving anything optional.** A configuration reader that checks one source for `!== ''` but then falls through to a bare `$_ENV[$name] ?? NULL` will resolve a set-but-empty variable to `''`. Because `''` is not null, it defeats a `?? 'default'` — and the feature comes up *enabled with empty credentials*.

This is not theoretical: exactly this produced HTTP basic auth accepting an empty username and password (`curl -u ':'` returned 200 while the real credentials returned 401). It was invisible under php-fpm, whose `variables_order` of `GPCS` leaves `$_ENV` empty, and appeared only under FrankenPHP, which populates it. Write one helper that treats empty as absent, and use it everywhere:

```php
function env_or(string $name, ?string $default = null): ?string {
    $value = getenv($name);
    if ($value === false || $value === '') {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? null;
    }
    return ($value === null || $value === '') ? $default : $value;
}
```

Coolify makes this more likely than usual, because `${VAR:-}` in a compose file produces a *set-but-empty* variable rather than an unset one.

### Cached configuration outlives an environment change

Frameworks that compile configuration to a cache file (Laravel's `config:cache`, Symfony's compiled container, Drupal's cached container) freeze whatever the environment held at cache time. Changing a variable in Coolify's UI and restarting is then **not** enough. Either rebuild the cache in the post-deployment command, or do not cache configuration. See `05-php-applications.md` §3.

### Values that look like regular expressions

Anything fed into a regex — Drupal's `trusted_host_patterns` is the canonical case — must have a documented, unambiguous format, and the code must not silently transform it. `preg_quote`ing an operator-supplied regex turns `^host\.example\.com$` into a pattern matching nothing. See `06-drupal.md` §3.

### Secrets in `docker inspect`

Runtime environment variables are visible to anyone who can run `docker inspect` on the server. That is normal and unavoidable for this deployment model; it is a reason to keep server access tight, not a reason to invent an alternative.

## 8. Review checklist

- [ ] Every operator-tunable value uses `${VAR}` or `${VAR:-default}`
- [ ] No secret has an invented default
- [ ] `.env.example` lists exactly the keys the compose file references
- [ ] Secrets are not marked as build variables unless the build needs them; if it does, build secrets are enabled
- [ ] Values containing `$` are flagged literal; keys and certificates are flagged multiline
- [ ] Shared credentials use `{{project.*}}` / `{{team.*}}` rather than being copied per resource
- [ ] Application code treats empty as absent
- [ ] Any config cache is rebuilt after deploy

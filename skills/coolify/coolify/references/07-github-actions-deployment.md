# GitHub Actions → Coolify

Two deployment models, the CI that implements each, and the server-side setup they depend on. Written to be self-contained: §3–§6 are a general GHCR pipeline, §2 and §7 are the Coolify-specific parts.

## 1. Choosing the build model

| | **A. Build on the Coolify server** | **B. Build in CI, pull from a registry** |
| --- | --- | --- |
| Compose contains | `build:` | `image:` + `pull_policy: always` |
| Build time counts as | Deploy time | CI time, before the deploy starts |
| Build resources | The production server's CPU, RAM, disk | GitHub-hosted runners |
| Layer cache | The server's local Docker cache | `type=gha`, shared across runs |
| Rollback | Redeploy an older commit and rebuild | Repoint at an older image tag; no rebuild |
| Registry auth needed on the server | No | **Yes** — `docker login ghcr.io` |
| Private dependencies | Credentials must reach the server | Credentials stay in CI |
| Deploy is deterministic | No — the build can produce a different image than CI tested | Yes — the exact tested image ships |
| Failure blast radius | A broken build burns production CPU and can leave a half-deployed stack | A broken build fails in CI, production untouched |
| Best for | Small stacks, single server, no CI budget | Anything with tests, multiple services, or a resource-constrained server |

**Default to B.** The decisive argument is not speed but determinism: in model B the artefact CI tested is the artefact that runs. Model A rebuilds on the server from source and can produce something CI never saw — a different base-image digest, a different transitive dependency, a partially warm cache.

Model A remains reasonable for a small stack on a roomy server where nobody wants to manage registry credentials.

The choice determines the shape of `docker-compose.yml`; see `02-docker-compose.md` §8.

## 2. Server-side prerequisites for model B

### `docker login` on the destination server

**Coolify has no registry-credential UI. It uses the Docker daemon's stored credentials on the server**, so someone must log in there once, over SSH:

```sh
echo "$GITHUB_PAT" | docker login ghcr.io -u "$GITHUB_USERNAME" --password-stdin
```

Details that cause trouble:

- **Log in as the user Coolify connects as.** Credentials land in `~/.docker/config.json` for *that* user — `/root/.docker/config.json` when Coolify SSHs as root. Logging in as `ubuntu` while Coolify connects as `root` produces a pull failure that looks exactly like a missing image. Check with `select name, ip, "user" from servers;` on `coolify-db`.
- **The PAT needs `read:packages`**, nothing more, for pulling. A classic PAT works; a fine-grained token needs the package read permission on the owner.
- **Do this on every destination server**, including every node of a Swarm cluster — each node pulls independently.
- The login persists across reboots. It does not persist across a rebuilt server, and a rotated PAT breaks it silently until the next pull.
- **Verify from the server, not from the UI:**

  ```sh
  docker pull ghcr.io/<org>/<repo>:latest
  ```

  A `denied` or `unauthorized` here is the whole problem; anything Coolify reports is downstream of it.

### `pull_policy: always`

Without it, a deploy that finds a local image already tagged `latest` reuses it. The deploy reports success and ships nothing. See `02-docker-compose.md` §8B.

### Package visibility

A GHCR package created by a workflow inherits the repository's visibility. If the repository is private, the package is private and the `docker login` above is mandatory. Making the package public removes that requirement — a legitimate choice for open-source images, and never for anything with credentials baked in.

## 3. The workflow skeleton

Four jobs, in order: **test → build-and-push → prune → deploy**. The whole file is language-agnostic apart from the `test` job.

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
    tags: ['v*']
    paths-ignore:
      - '**.md'
      - 'docs/**'
      - '.gitignore'
      - '.editorconfig'
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}
```

- `concurrency` with `cancel-in-progress` stops two pushes racing to deploy. Without it, the older build can finish last and overwrite `latest` with stale code.
- `paths-ignore` keeps documentation commits from burning a build and a deploy.
- `IMAGE_NAME: ${{ github.repository }}` yields `ghcr.io/<owner>/<repo>`, which is what GHCR expects and what links the package to the repository.

## 4. The test job

Runs on pull requests too — it is the gate. Everything downstream carries `if: github.event_name != 'pull_request'`.

<details>
<summary>PHP / Laravel</summary>

```yaml
  test:
    name: Test and build assets
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.5'
          extensions: dom, curl, libxml, mbstring, zip, pcntl, pdo, sqlite, pdo_sqlite, bcmath, intl, gd
          coverage: none

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - name: Install Composer dependencies
        env:
          RAW_AUTH: ${{ secrets.COMPOSER_AUTH || secrets.GITHUB_TOKEN }}
        run: |
          if [ -n "$RAW_AUTH" ]; then
            case "$RAW_AUTH" in
              \{*) export COMPOSER_AUTH="$RAW_AUTH" ;;
              *)   export COMPOSER_AUTH="{\"github-oauth\":{\"github.com\":\"$RAW_AUTH\"}}" ;;
            esac
          fi
          composer install --prefer-dist --no-interaction --no-progress

      - run: npm ci
      - run: npm run build
      - run: vendor/bin/pint --test
      - name: Run tests
        env:
          APP_KEY: base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
          DB_CONNECTION: sqlite
          DB_DATABASE: ':memory:'
        run: php artisan test
```

The `APP_KEY` here is a throwaway for the test run only. Never reuse a production key in CI.
</details>

<details>
<summary>Go</summary>

```yaml
  test:
    name: Build and test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-go@v5
        with:
          go-version-file: go.mod
          cache: true
      - run: go mod download
      - name: Verify formatting
        run: |
          if [ -n "$(gofmt -l .)" ]; then
            echo "Not formatted:"; gofmt -l .; exit 1
          fi
      - run: go test -v -race ./...
      - run: go build -v -o bin/app ./cmd/api
```
</details>

## 5. Build and push

```yaml
  build-and-push:
    name: Build and push image
    needs: test
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v7

      - uses: docker/setup-buildx-action@v4

      - name: Log in to GHCR
        uses: docker/login-action@v4
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v6
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}
            type=ref,event=branch
            type=semver,pattern={{version}}
            type=sha,prefix=sha-

      - name: Build and push
        uses: docker/build-push-action@v7
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          secrets: |
            COMPOSER_AUTH=${{ secrets.COMPOSER_AUTH || secrets.GITHUB_TOKEN }}
          provenance: false
```

Notes:

- `permissions: packages: write` is required. The automatic `GITHUB_TOKEN` can push to GHCR for the same repository — no PAT needed on the CI side. A PAT is only needed for pulls **on the Coolify server** (§2) and for pushing to a *different* repository's package.
- **The tag set matters.** `latest` is what the compose file references and what a deploy pulls. `sha-<short>` is what makes rollback possible: repoint the compose file (or a Coolify variable holding the tag) at a specific commit's image and redeploy, with no rebuild.
- `cache-from`/`cache-to: type=gha` reuses layers across runs. `mode=max` caches intermediate stages too, which is the difference that matters for a multi-stage build.
- `secrets:` passes a BuildKit secret matching the `--mount=type=secret,id=COMPOSER_AUTH` in the Dockerfile. This is how private dependencies get in without landing in image metadata. `secrets.COMPOSER_AUTH || secrets.GITHUB_TOKEN` falls back to the automatic token, which suffices for private repositories in the same organisation.
- Add `platforms: linux/amd64,linux/arm64` only if the servers genuinely differ. Multi-arch roughly doubles build time.
- **`provenance: false` is not optional if you prune untagged versions (§6).** `docker/build-push-action` attaches a provenance attestation by default. On GHCR that attestation appears as an *untagged* package version which the tagged manifest index still references — so an untagged prune can delete it out from under a live tag and break `docker pull`. Single-arch deployment images gain nothing from attestations. Keep them only if you actually verify them, and then never prune untagged versions to zero.

## 6. Pruning old package versions

GHCR storage is not free and untagged versions accumulate on every push. This job keeps it bounded.

**Know the action's real input list before you write this job.** `actions/delete-package-versions@v5` accepts *only* these, per its `action.yml`:

`package-version-ids`, `owner`, `package-name`, `package-type`, `num-old-versions-to-delete`, `min-versions-to-keep`, `ignore-versions`, `delete-only-pre-release-versions`, `delete-only-untagged-versions`, `token`

There is **no tag-regex input.** GitHub Actions only *warns* about an unrecognised `with:` key and still runs the step, so an invented input like `delete-only-package-with-specified-tag-regex` fails silently and the step quietly degrades into a plain keep-N-newest delete across every version of the package. Verify any input you are unsure about against the action's `action.yml`.

```yaml
  prune-old-images:
    name: Prune old package versions
    needs: build-and-push
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      packages: write
    steps:
      - name: Delete untagged versions
        uses: actions/delete-package-versions@v5
        with:
          package-name: <package-name>          # the repo name, lowercase, not owner/repo
          package-type: container
          min-versions-to-keep: 0
          delete-only-untagged-versions: 'true'

      - name: Bound tagged version history
        uses: actions/delete-package-versions@v5
        with:
          package-name: <package-name>
          package-type: container
          min-versions-to-keep: 10
```

- Two steps, deliberately. The first clears untagged layers left behind when a tag moves. The second bounds total history while keeping enough versions to roll back to.
- **`package-name` is the package name, not `owner/repo`.** Getting this wrong makes the job succeed while deleting nothing — check the Packages tab for the exact string. Note that for a compose stack pushing several images from one repo, the package name is usually `<repo>/<image>`.
- **`min-versions-to-keep` on the second step is your rollback depth.** It counts *versions*, not tags: one push produces one version carrying `latest`, `main` and `sha-<short>` together, so a depth of 10 means the last ten builds. Three is tight; ten is comfortable. The just-pushed `latest` is always among the newest kept, which is what keeps the deployed tag safe.
- **Do not try to protect `latest` with `ignore-versions`.** That input is matched against the package *version name*, which for container packages is the image digest (`sha256:…`), never a tag. `ignore-versions: '^latest$'` therefore matches nothing and protects nothing — a very easy thing to write and believe. Recency is what keeps `latest` alive.
- **The second step cannot be limited to `sha-` tags**, because the action has no tag filter. It bounds *all* tagged versions. If your tag set includes `type=semver` release tags, old release images will eventually be pruned too. When preserving releases matters, either raise the depth substantially or use an action that genuinely filters by tag, such as [`snok/container-retention-policy`](https://github.com/snok/container-retention-policy).
- **`min-versions-to-keep: 0` on the untagged step requires `provenance: false` on the build** (§5). Otherwise this step deletes the attestation manifest that the tagged index references.
- Run it **after** the push, never before — deleting first would remove the version you are about to need.
- It runs in the same workflow rather than on a schedule so that storage never drifts unattended. A separate scheduled workflow is a fine alternative if the job is noisy.
- Listing package versions through the REST API (to check what the job actually did) needs a token with `read:packages`. The workflow's own `GITHUB_TOKEN` with `packages: write` is enough for the deletes themselves.

## 7. Triggering the deployment

```yaml
  deploy-to-coolify:
    name: Deploy to Coolify
    needs: build-and-push
    if: github.ref == 'refs/heads/main' && github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    environment: production   # not boilerplate — see "Which GitHub environment?" below
    steps:
      - name: Trigger Coolify deployment
        env:
          COOLIFY_WEBHOOK_URL: ${{ secrets.COOLIFY_WEBHOOK_URL }}
          COOLIFY_API_TOKEN: ${{ secrets.COOLIFY_API_TOKEN }}
        run: |
          if [ -z "$COOLIFY_WEBHOOK_URL" ]; then
            echo "COOLIFY_WEBHOOK_URL is not set." >&2
            exit 1
          fi
          curl -fsS -X POST \
            -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
            "$COOLIFY_WEBHOOK_URL"
```

### `-X POST` is not optional

**Since Coolify 4.2.0, state-changing API endpoints reject `GET` with `405 Method Not Allowed`.** `/deploy` is among them; the shipped OpenAPI spec declares only `post`.

A great many existing pipelines — including ones written against 4.1.x that worked perfectly — use `curl -fsSL "$COOLIFY_WEBHOOK_URL"`, which issues a `GET`. **Those pipelines break silently on upgrade**: the build and push succeed, the deploy step fails or the failure is swallowed, and the running site quietly stays on the old image. This is the first thing to check when "CI is green but the site is stale".

### Fail loudly, do not skip

The common pattern of "if the secret is missing, print a message and exit 0" turns a misconfigured deployment into a green build. Prefer failing. If a soft skip is genuinely wanted (say, forks cannot deploy), make it visible with `::warning::`.

### Which GitHub environment? Decide, don't copy

A qualified deploy job names a [GitHub environment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments). The `environment:` line is what scopes `COOLIFY_WEBHOOK_URL` and `COOLIFY_API_TOKEN` as environment secrets — out of reach of workflows on other branches — and it is where protection rules (required reviewers, branch restrictions, wait timers) and the repo's deployment history attach. `production` in the example above is a placeholder for *that repo's* deploy target, not a value to copy.

Before emitting this job for a real repository, establish the target:

1. **See what already exists:**

   ```sh
   gh api repos/<owner>/<repo>/environments --jq '.environments[].name'
   ```

   If environments exist, use the one that matches the target being deployed — do not invent a second name for the same target. Where the Coolify side has named environments too (a Coolify project's *production* / *staging*), matching the names across both systems avoids permanent confusion.

2. **If none exists, create it — with its secrets — before the first run**, or ask the user what to call it:

   ```sh
   gh api -X PUT repos/<owner>/<repo>/environments/production
   gh secret set COOLIFY_WEBHOOK_URL --env production
   gh secret set COOLIFY_API_TOKEN --env production
   ```

   Naming a nonexistent environment does **not** fail the workflow: GitHub auto-creates it on first run, with no protection rules and no secrets. The deploy job then runs ungated and dies on the empty `COOLIFY_WEBHOOK_URL` — or worse, "succeeds" if the step soft-skips (see "Fail loudly" above).

3. **Multiple targets** (staging deployed from `develop`, production from `main`): one deploy job per target, each with its own `environment:`, its own webhook URL (a different Coolify resource UUID), and its own token, each stored as secrets on its own environment. A single job can also compute the name — `environment: ${{ github.ref == 'refs/heads/main' && 'production' || 'staging' }}` — but per-target jobs read better in the Actions UI and let the `if:` conditions stay simple.

4. **Deliberately using no environment** is legitimate for a small personal repo. Then *drop* the `environment:` line and store the two secrets as repository secrets — accepting that there is no approval gate, no deployment history, and that any workflow in the repo can read the deploy credential. What is not legitimate is emitting `environment: production` decoratively in a repo where nobody set that environment up; that is exactly how the silent auto-create in point 2 happens.

### Webhook URL and token

- The URL comes from the application's **Webhooks** tab in Coolify. It resolves to `POST /api/v1/deploy?uuid=<resource-uuid>`, and `force=true` can be appended for a no-cache rebuild.
- The token is generated under **Keys & Tokens → API Tokens**, and needs the `deploy` permission.
- Store both as **environment secrets** on the environment the deploy job names (see "Which GitHub environment?" above) rather than plain repository secrets.
- Coolify's own git-source webhook (auto-deploy on push) is an alternative for model A. **Turn it off when using this workflow**, or every push deploys twice — once from Coolify's webhook against un-built code, once from CI.

### What the deploy actually does

In model B, the deploy re-runs `docker compose up -d` on the server. Because the compose file says `pull_policy: always`, Docker fetches the new `latest`. Nothing rebuilds. The whole deploy is a pull and a container replacement, typically seconds.

### Waiting for the result

The trigger returns as soon as the deployment is queued; it does not wait. When CI needs to gate on the outcome, poll:

```sh
DEPLOY_UUID=$(curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
  "$COOLIFY_WEBHOOK_URL" | jq -r '.deployments[0].deployment_uuid')

for _ in $(seq 1 60); do
  STATUS=$(curl -fsS -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
    "https://<coolify-host>/api/v1/deployments/$DEPLOY_UUID" | jq -r '.status')
  case "$STATUS" in
    finished) echo "deployment succeeded"; exit 0 ;;
    failed|cancelled) echo "deployment $STATUS"; exit 1 ;;
  esac
  sleep 10
done
echo "timed out waiting for deployment"; exit 1
```

Verify the response shape against your version's `/api/v1/deployments/{uuid}` before relying on the field names — this is exactly the kind of detail that moves between releases.

## 8. Secrets summary

| Secret | Scope | Needed for | Notes |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | automatic | Pushing to GHCR, pruning | No setup; requires `packages: write` on the job |
| `COOLIFY_WEBHOOK_URL` | environment (the deploy job's — §7) | Triggering the deploy | From the application's Webhooks tab; one per deploy target |
| `COOLIFY_API_TOKEN` | environment (the deploy job's — §7) | Authorising the trigger | Needs the `deploy` permission |
| `COMPOSER_AUTH` | repository | Private Composer packages | A bare PAT or a full JSON document; the Dockerfile handles both |
| A PAT with `read:packages` | **on the server, not in CI** | Pulling the private image | Used once in `docker login ghcr.io` |

## 9. Troubleshooting the pipeline

| Symptom | Check | Cause |
| --- | --- | --- |
| CI green, site unchanged | The deploy step's HTTP method | `GET` against Coolify ≥ 4.2.0 → `405` |
| CI green, deploy green, site unchanged | `pull_policy` in the compose file | Missing → stale local `latest` reused |
| Deploy fails pulling the image | `docker pull ghcr.io/<org>/<repo>:latest` **on the server** | No `docker login`, or logged in as the wrong user |
| Prune job succeeds, storage still growing | The `package-name` value | It is the package name, not `owner/repo` |
| Deploy step sees empty `COOLIFY_WEBHOOK_URL` though "the secret is set" | Where the secret lives vs the job's `environment:` | Secret stored on an environment the job does not name (wrong name, or no `environment:` line at all), or the named environment was silently auto-created empty — see §7 |
| Two deploys per push | Coolify's git-source auto-deploy | Both Coolify's webhook and CI are triggering |
| Older push overwrites newer | `concurrency` block | Missing or missing `cancel-in-progress` |
| Build works locally, fails in CI | `cache-from`/`cache-to` and the base-image digest | Local cache hides a broken layer |
| `image "…": already exists` | Count services with `build:` | Two services building into one tag; see `02-docker-compose.md` §3 |

# Tracking Coolify Releases

Coolify ships fast and its release notes are a summary, not a specification. This file is the memory of what past analyses found, and the method that produced it, so that checking a new release does not mean re-deriving seven versions of context.

Use it when asked what changed in Coolify, whether it is safe to upgrade, or whether a new release affects an existing setup.

## 1. Where to resume from

The **version anchor** in `SKILL.md` — the "Stable line at time of writing" row — records the last version analysed. Everything past it is unexamined.

```sh
gh release list --repo coollabsio/coolify --limit 20
```

Diff the gap. Update the anchor when the analysis is done, or the next session cannot tell what was covered.

The open questions in `08-troubleshooting.md` §4 are the other half of the state: what was looked at and deliberately *not* resolved.

## 2. The clone

A blobless clone makes every check that follows cheap, and lets you read any tag without a full history:

```sh
git clone --filter=blob:none --no-checkout \
  https://github.com/coollabsio/coolify.git coolify
```

Put it in a scratch directory, never in a tracked repo. `git show <tag>:<path>` and `git diff <tagA>..<tagB> -- <paths>` are the two commands that do the work.

Note that `git log -S` over a blobless clone fetches blobs on demand and can be very slow. Prefer diffing two tags directly.

## 3. What to diff

Whole-release diffs are too large to read. These paths carry almost everything that changes behaviour:

| Concern | Paths |
| --- | --- |
| Compose parsing and labels | `bootstrap/helpers/{parsers,docker,domains,shared}.php` |
| Deployment behaviour | `app/Jobs/ApplicationDeploymentJob.php`, `app/Traits/ExecuteRemoteCommand.php` |
| Git sources | `app/Livewire/Source/`, `bootstrap/helpers/github.php`, `app/Models/GithubApp.php` |
| Schema and defaults | `database/migrations` — read the added files, the defaults decide the upgrade impact |
| Remote execution | `bootstrap/helpers/remoteProcess.php` — sudo wrapping, credential context |

A new migration's `->default(...)` is usually the fastest way to tell whether a change alters existing resources or only new ones.

## 4. The verification rule

**Check the tag, not the notes.** Release notes omit scope and occasionally describe the wrong cause. Two documented cases from past analyses:

- 4.3.22's host-path removal did not say that existing bind mounts keep deploying — only the diff showed the column and its deploy-time use were untouched.
- The 4.3.19 registry-credentials entry in `01-architecture-and-versions.md` §3 was originally written from symptoms during an outage and attributed the failure to a change in how the helper resolves the docker config. That code is identical from 4.1.2 to 4.3.23. The real change was the pull moving ahead of the container stop. Reading the tags caught it; reading the notes would not have.

Corollary, and the reason Rule 0 exists: a change that shipped alongside a recovery is not thereby its cause.

## 5. Standing threads

Two long-running questions get re-checked every release.

### GitHub App across multiple organizations

A single GitHub App installed into several organizations is only partially supported: one Coolify source carries one `installation_id`, so each organization needs its own source, hand-assembled by reusing the same App ID, client ID, secrets and private key. Up to 4.4.x, push webhooks only reached applications under one of those sources, so automatic deploys did not work for the others; 4.5.0 fixes that (below).

Check, in order — any one of these changing is the news:

```sh
git grep -n "installation_id" <tag> -- database/migrations       # still a single column?
git show <tag>:resources/views/livewire/project/new/github-private-repository.blade.php \
  | grep -ci organization                                        # does the picker show the org yet?
gh issue view 5364 --repo coollabsio/coolify --json state,updatedAt
```

The single `installation_id` column, the missing organization field in the picker, and open issue 5364 are unchanged from 4.1.2 through 4.5.0. **What changed at 4.5.0 is webhook routing:** a GitHub App webhook is now matched to the source whose `installation_id` it carries, where before it went to the first source with that App ID — so pushes to repositories under every source but the first never found their applications. Automatic deploys on push should therefore now work for each per-organization source. This is the fix for [#11271](https://github.com/coollabsio/coolify/issues/11271), commit `492b17476`, with an upstream test; it is upstream's own version of [#11272](https://github.com/coollabsio/coolify/pull/11272), which proposed the same lookup — `installation.id` first, `app_id` as fallback — and was closed unmerged in its favour. #11272 was verified on a live instance; the 4.5.0 commit is not yet tested end to end here. Thread closed for webhooks; still open for the picker and the hazards below. Two hazards persist for anyone using the workaround (both re-checked at 4.5.0):

- **Do not press "Refetch" on the Permissions tab.** It overwrites the source's Coolify name with the real app slug — collapsing the distinct names that tell the organizations apart, since the resource picker shows only name and `html_url`.
- **"Update on GitHub" 404s.** The link is built as `/organizations/{org}/settings/apps/...` when `organization` is set, but in this setup that field is the installation *target*, not the app *owner*.

### Compose routing and domains

The area that has changed most. Re-check whenever `parsers.php` or `docker.php` move: router and service label names, where domains are stored, how the backend port is resolved, and which credential context a pull runs in.

## 6. What has been found so far

Each row is a change that altered behaviour for an existing setup. Detail lives in `01-architecture-and-versions.md` §3.

| Version | Finding |
| --- | --- |
| 4.2.0 | State-changing API endpoints POST-only; Member role read-only |
| 4.3.0 | Traefik router names gain a hash suffix — the one change most likely to break custom proxy config; `docker_compose_domains` re-keyed to original service names; deploy confirmations removed |
| 4.3.3 | `traefik.docker.network` label added to every compose service |
| 4.3.8–4.3.9 | **Broken for Caddy** — `fqdnLabelsForCaddy()` called with an unknown named argument, 500 on any label generation. Fixed in 4.3.10 |
| 4.3.15 | Domain ports moved out of `fqdn` into `domain_port_overrides`, converted lazily on save; restart limits introduced with a default of 10; `COOLIFY_FQDN`/`COOLIFY_URL` stopped dropping every domain after the first |
| 4.3.16, 4.3.18 | Compose labels use each service's own ports; multi-service domains no longer inherit the application port |
| 4.3.17 | A removed compose service domain is no longer regenerated by a magic `SERVICE_URL_*` variable |
| 4.3.19 | Sentinel mandatory on regular servers, toggle read-only; compose images pulled before the old containers stop — which **inverted the `pull_policy: always` rule** |
| 4.3.21 | Restart limits made opt-in and existing tens reset to unlimited |
| 4.3.22 | Host-path volumes removed from UI and API. **Do not run this version** — untrimmed saved output makes a healthy container fail its own deployment |
| 4.3.23 | The 4.3.22 regression fixed, 96 minutes later |
| 4.4.0 | Registry logins in the UI and API, writing the SSH user's docker config; generated container names gain an ISO timestamp and an optional prefix, and applications with a stored custom name were migrated to consistent naming (no rolling update); `coolify.*` container labels keyed by UUID; variable names validated; proxy no longer re-attached to networks hourly; `coolify-realtime` container removed; logs need `read:sensitive` in the API; server roles; multi-server rules tightened; traffic analytics (enabling restarts the proxy); several non-root-server fixes |
| 4.4.1 | Sentinel 1.0.2, host image pinned by digest |
| 4.4.2 | Server-side build cache no longer reset every deploy by the helper's `--add-host` entries |
| 4.4.4–4.4.5 | **Do not run** — the `coolify` container fails to start (`s6-overlay` permission denied, #12141) |
| 4.4.6 | Fixes the startup failure |
| 4.4.7, 4.3.24, 4.2.1, 4.1.3, 4.0.1 | Same security release on every line (PHP2Shell CVE-2026-109618/109619, cloudflared, Sentinel 1.1.2). No behaviour change in the paths this skill diffs; 4.4.6 → 4.4.7 touches five files |
| 4.5.0 | Compose `scale`/`replicas` > 1 rejected; pre-pull skips services that reuse a built tag (broken since 4.3.19, #11773) and skips entirely under a custom build command; new variables use exact escaping while existing ones stay legacy until deleted and re-added; `POST /enable` removed and more API routes need `deploy`; scheduled tasks only in running containers — and still blind to a container-name prefix; GitHub App webhooks routed by installation; Nixpacks marked deprecated; Rollback lists registry images (not for Compose); Coolify DB backed up before update; Gitea App sources; Traefik 3.7.16 |

### Answered along the way

- **Traefik does infer a port from a multi-port image.** `getPort` sorts the exposed ports numerically and takes the lowest. It does not error and does not guess. See `08-troubleshooting.md` §2.2.
- **An unhealthy container does not fail a deploy.** Observed directly: deployment reported as passed while the application was failing. A green deploy means the containers started.
- **Coolify pulls from two credential contexts** — the helper uses the SSH user's docker config, host-side commands are sudo-wrapped and use root's. The deploy's own `docker compose up` is host-side when the resource preserves its repository or uses raw compose deployment (verified at 4.3.23). See `02-docker-compose.md` §8B.
- **`SERVICE_PASSWORD_<ID>` is 32 characters, not 16.** `Str::password(symbols: false)` with Laravel's default length, unchanged from 4.0.0 to 4.5.0. The upstream docs say 16.
- **The compose pre-pull and `up` commands, and the helper's config mount, are byte-identical between 4.3.23 and 4.4.6.** The 4.4.0 registry feature adds a way to write the file; it does not change who reads it.
- **At 4.5.0 the helper's config mount is still identical**, still omitted silently when the file is missing. The pre-pull command changed only in *which* services it names; it still runs in the helper (or on the main server for build-server deploys), so the credential contexts in `02-docker-compose.md` §8B stand.
- **The 4.5.0 migration comment on exact escaping says re-saved variables convert. They do not** — nothing in the model or the UI clears `uses_legacy_escaping`; only a new record gets exact escaping, which is why the UI says delete and re-add. Another case for checking the tag over the notes.

## 7. What is worth recording

**Something earns a place in this skill if it changes what you would do or recommend.** Not if it is interesting, and not because it was discovered.

- A symptom someone will hit, with a cause and a fix → a row in `08-troubleshooting.md`.
- A rule that changes how a compose file, workflow or variable should be written → the relevant reference, stated as the rule, with only as much mechanism as the rule needs.
- Something that changed once, will not change again, and needs no action → one line in the log above. That is what the log is for.
- Internal structure that changes no action → leave it out, however well understood.

The failure mode this guards against is transcribing the source. A worked example: Coolify's `compose_parsing_version` selects which parser a resource goes through, and the temptation is to document the dispatch. The only part that changes an action is that legacy resources swap `COOLIFY_URL` and `COOLIFY_FQDN` — so that is recorded, in `03-environment-variables.md` §6, and the dispatch is not.

Apply the same test when a finding decays. A bug fixed three releases ago that only ever affected an operation most people never perform has stopped changing anything; it belongs in the log, or nowhere.

## 8. Where the output goes

- **Findings that generalise** — this skill, as a PR. Update the version anchor in `SKILL.md` in the same change.
- **Anything about specific servers** — which host runs what, which user holds which registry login, instance versions — belongs in private notes. This repository is public.
- **Something checked and found unchanged** is worth recording too. "Still no multi-org support at 4.3.23" is the answer to a question that would otherwise be asked again.

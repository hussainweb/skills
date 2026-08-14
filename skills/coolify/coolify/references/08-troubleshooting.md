# Troubleshooting Coolify Deployments

## 0. Method — read this before forming a theory

Every wrong answer in the episode this file is drawn from came from reasoning about *configuration*. Every correct one came from `docker inspect`, a SQL query, or a side-by-side comparison against a working resource.

1. **Check runtime state before theorising.**
2. **Diff against a known-good resource on the same host, early.** Two `docker inspect` outputs side by side beat every theory. This should be step one, not step ten.
3. **Write a falsifiable prediction per theory and check it before acting.** "If X caused this, then Y must be true." Several plausible theories die in one command.
4. **The UI's generated preview is not evidence.** "Show Deployable Compose" *renders* labels for display. It is the single most misleading artefact available, and it looks authoritative.
5. **Bad tests are worse than no tests.** Grepping Coolify's stored compose for a string that only appears in a *comment* produces a confident false negative — Coolify strips comments when it re-serialises.
6. **Distinguish "I fixed it" from "it started working."** Changes shipped alongside a recovery are not thereby proven.
7. **Establish the version first** (`01-architecture-and-versions.md` §2). A column name recalled from an older schema failed outright; the same risk applies to every remembered behaviour.

## 1. Symptom → check → cause

| Symptom | One-command check | Most likely cause |
| --- | --- | --- |
| `503 no available server` | Count `traefik.*` labels on the container (§2.1) | **0 labels → the resource has no domain set.** No domain, no router |
| `503`, but 11+ labels present | Count the image's exposed ports (§2.2) | More than one exposed port and no `loadbalancer.server.port` → Traefik cannot infer which |
| `404` on HTTP, `503` on HTTPS | As above | A router exists for HTTPS only; same problem |
| Intermittent HTTPS failures, works on retry | `grep -n 'networks:' docker-compose.yml` | A custom `networks:` block puts containers on two networks; Traefik picks non-deterministically |
| TLS presents `CN=TRAEFIK DEFAULT CERT` | `openssl s_client -connect host:443 -servername host` | Traefik was asked for that SNI and has no certificate. Usually a consequence of having no working router, not a separate ACME fault |
| Deploy fails: `image "…": already exists` | Count services carrying `build:` | Two or more building into one `image:` tag; buildx bake races on export |
| Deploy fails pulling an image | `docker pull <image>` **on the server** | No `docker login` for the registry, or logged in as a different user than Coolify connects as |
| Container healthy, site still 503 | `docker network inspect <resource-uuid>` | Rules network *out*: the proxy should be listed alongside your services and able to reach them directly |
| Deploy succeeds, code unchanged | `docker inspect <container> --format '{{.Image}}'` then compare to the registry digest | Missing `pull_policy: always`; the stale local `latest` was reused |
| CI green, nothing deployed | The deploy step's HTTP method | `GET` on `/deploy` returns `405` since 4.2.0 |
| Container flapping / marked unhealthy | `docker inspect <c> --format '{{json .State.Health}}' \| jq` | A health check rejecting a legitimate 302/401/403, or a worker inheriting the web image's `HEALTHCHECK` |
| A variable changed in the UI has no effect | Whether the framework caches configuration | Compiled config cache from an earlier build (`config:cache`, compiled container) |
| A variable removed from git still appears | Coolify's variable list for the resource | Coolify's store persists independently of the compose file |
| Everything looks right in the UI | **Stop trusting the UI** | The deployable-compose preview generates labels for display, not for deployment |

## 2. Diagnostic toolkit

### 2.1 Does the container have Traefik labels at all?

The single most useful command. A working resource showed **11** Traefik labels; the broken one showed **0** (of 31 total, the rest being Compose's own and `coolify.*`).

```sh
docker inspect <container> --format '{{range $k,$v := .Config.Labels}}{{$k}}
{{end}}' | grep -c traefik
```

Then read them:

```sh
docker inspect <container> --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' | grep traefik | sort
```

Note: a working Coolify app has **no** `traefik.http.services.*.loadbalancer.server.port` label. Its absence proves nothing.

### 2.2 How many ports does the image expose?

```sh
docker inspect <image-or-container> \
  --format '{{range $p,$v := .Config.ExposedPorts}}{{$p}} {{end}}'
```

Typical Coolify apps expose exactly one. Some PHP base images expose four — `80/tcp 443/tcp 443/udp 2019/tcp`, the last being Caddy's admin API — which is enough for Traefik's single-port inference to have nothing to infer from. `expose:` in the compose file cannot *reduce* this and is inert when the image already declares the port.

### 2.3 Compare against a known-good resource on the same host

**The highest-value move available, and it is routinely made far too late.**

```sh
for c in <broken-container> <working-container>; do
  echo "## $c"
  docker inspect "$c" --format '{{range $k,$v := .Config.Labels}}{{$k}}={{$v}}
{{end}}' | grep -i traefik | sort
  echo "   ports: $(docker inspect "$c" --format '{{range $p,$v := .Config.ExposedPorts}}{{$p}} {{end}}')"
  echo "   nets:  $(docker inspect "$c" --format '{{range $n,$v := .NetworkSettings.Networks}}{{$n}} {{end}}')"
done
```

Two containers side by side answer in seconds what hours of theorising will not.

### 2.4 Query Coolify's database

Ground truth for what Coolify *thinks*, as opposed to what it renders. On the control plane:

```sh
docker exec coolify-db psql -U coolify -d coolify -t -A -F' | ' -c \
 "select uuid, name, coalesce(docker_compose_domains,'<NULL>'),
         length(coalesce(custom_labels,'')), coalesce(nullif(fqdn,''),'<EMPTY>')
  from applications order by name;"
```

For a Compose resource the per-service domain lives in `docker_compose_domains`, e.g. `{"web":{"domain":"https://host"}}`. Deploy output is in `activity_log.properties`.

**Verify the column names against your version before writing any query** (`01-architecture-and-versions.md` §5). And note that `custom_labels` holds **user-added** labels only — it is empty on most working applications, so its being empty means nothing.

### 2.5 Traefik's own view

```sh
docker inspect coolify-proxy --format '{{range .Args}}{{println .}}{{end}}'
docker logs --since 15m coolify-proxy 2>&1 | grep -iE "error|port is missing|no valid"
docker exec coolify-proxy sh -c \
  'wget -q -S -O /dev/null --header="Host: <host>" http://<container-ip>:80/'
```

Coolify runs Traefik with `--providers.docker --providers.docker.exposedbydefault=false` and, on 4.1.x at least, `--api.insecure=false` — so **the API is not reachable and Traefik cannot be asked what it resolved.** That is a real limit on how far this can be diagnosed from the host.

Coolify may also write file-provider configuration; check `/data/coolify/proxy/dynamic/` for stale routers.

### 2.6 Container health

```sh
docker inspect <container> --format '{{json .State.Health}}' | jq
docker inspect <container> --format '{{.Config.Healthcheck.Test}}'
docker logs --tail 100 <container>
```

The recorded `Output` of the last few probes usually names the problem outright — a 302 to an installer, a 400 from a trusted-host check, a connection refused during a slow boot that needs a longer `start_period`.

### 2.7 Connectivity from inside the container

Always test from inside; testing from the host proves nothing about the container's network.

```sh
docker exec <container> sh -c 'getent hosts <db-host>'
docker exec <container> sh -c 'nc -zv <db-host> <db-port>'
docker exec <container> env | sort            # what the app actually received
```

## 3. Worked example — five confident theories, all wrong

One `503 no available server`. Five explanations were produced and acted on before the real cause — an **empty domain field** on the resource — was spotted by the operator, not by any of the reasoning.

| Theory | Killed by |
| --- | --- |
| The health check rejected the empty-database 302, so the container was unhealthy and Traefik dropped it | The container reported **healthy** throughout the 503 |
| `SERVICE_FQDN_<SVC>_<PORT>` suppressed the `loadbalancer.server.port` label, and Traefik cannot infer a port from four | No port label is generated **either way**, and a working app on the host has none either |
| `coolify-proxy` was not attached to the resource's network | It was, and it could reach the container on `:80` directly — it got the app's 401 |
| `applications.custom_labels` was empty in Coolify's database | **Nine of ten** applications on that host had it empty and worked; it holds user-added labels only |
| `docker_compose_raw` was stale relative to git | Bad test — it was grepped for a string appearing only in a **comment**, and Coolify strips comments |

Two of these had a *true premise* and a false conclusion. The four exposed ports were real; Traefik's single-port inference rule is real. **Being right about the mechanism is not being right about the cause.**

The one command that would have ended it in seconds is §2.1 — count the Traefik labels. Zero labels means no router, which means no domain.

## 4. Open questions

Recorded so they are not silently re-derived as facts:

- **Why can a domain empty itself?** Observed once on a resource where it had previously been set and working. The only plausible link was that `SERVICE_FQDN_<SVC>_<PORT>` had just been removed from the compose file. Testable: remove it from a working resource, redeploy several times, see whether the domain survives.
- **How does Traefik resolve the port** for a container exposing four, given no `server.port` label and no `--providers.docker.network` constraint? Candidates: lowest-numbered exposed port, or Coolify supplying it by a route not visible in the labels. The Traefik API is not exposed, so this could not be answered from the host.
- **Does Coolify fail a deploy on an unhealthy container?** It surfaces health prominently; whether it gates is untested.
- **Do post-deployment commands and scheduled tasks behave as documented, and what happens on failure?** Untested.

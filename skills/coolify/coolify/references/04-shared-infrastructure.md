# Shared Infrastructure — Databases, Caches, and Cross-Stack Networking

Most Coolify servers end up hosting several applications that should not each run their own MySQL. This file covers the three topologies, how to connect across stacks without breaking Traefik, and what goes wrong when a cache is shared carelessly.

## 1. Three topologies

| Topology | The database/cache is… | Use when |
| --- | --- | --- |
| **A. In-stack** | A service in the application's own `docker-compose.yml` | The dependency is genuinely private to this app — a per-app cache, a per-app search index |
| **B. Coolify-managed, shared** | A separate Coolify **Database** resource on the same server, used by several applications | Several apps on one server need a real database with backups and monitoring |
| **C. External** | A managed service or a dedicated database host outside Coolify | Production data with independent scaling, HA, or a separate ops boundary |

These compose freely: an app commonly has an in-stack Redis (A) and an external MySQL (C).

## 2. Topology A — in-stack dependencies

Simplest and safest, because the stack's private network already isolates it. Service names resolve as hostnames within the stack.

```yaml
services:
  web:
    image: ghcr.io/<org>/<repo>:latest
    pull_policy: always
    environment:
      - REDIS_HOST=${REDIS_HOST:-redis}
      - REDIS_PORT=${REDIS_PORT:-6379}
    depends_on:
      - redis

  redis:
    image: redis:8-alpine
    restart: unless-stopped
    command: redis-server --maxmemory 512mb --maxmemory-policy allkeys-lru --save "" --appendonly no
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

Notes:

- Still write the host and port as `${REDIS_HOST:-redis}`, not a literal. That is what makes the same file work when the operator later points it at a shared instance.
- `--save "" --appendonly no` disables persistence, which is correct for a pure cache and avoids fsync stalls. If the same Redis also backs a queue whose jobs must survive a restart, persistence must stay on — or the queue belongs on a different Redis.
- Size `--maxmemory` deliberately. An unbounded Redis on a shared host is the classic cause of an OOM that takes out unrelated containers.
- Choose the eviction policy for the workload: `allkeys-lru` for a pure cache, `volatile-lru` when some keys must not be evicted.

**Do not publish the port.** A `ports: ["6379:6379"]` on an in-stack Redis exposes it on the host interface, where by default it has no authentication.

## 3. Topology B — a shared Coolify-managed database

Create the database as its own Coolify **Database** resource, then connect the applications to it.

### Connecting across stacks: "Connect to Predefined Network"

Coolify isolates each Compose stack on its own bridge network. An application on network `<app-uuid>` cannot resolve a database container living on the `coolify` network — the symptom is a connection error or a 500 that looks like a credentials problem.

The supported fix is **not** to add a `networks:` block to your compose file. That causes intermittent HTTPS outages, because containers then sit on two networks and Traefik picks non-deterministically. Instead:

1. Open the application resource in Coolify.
2. Go to **Configuration → Advanced** (labelled **Network** in some versions).
3. Enable **Connect To Predefined Network**.
4. Select the **`coolify`** network and save.
5. Redeploy.

The application's containers are then attached to the shared network as well, and Docker DNS resolves the database container by name.

After enabling it, verify rather than assume:

```sh
docker network inspect coolify --format '{{range .Containers}}{{.Name}} {{end}}'
docker exec <app-container> getent hosts <db-container-name>
```

### Credentials

Point each application at the shared database with **shared environment variables** rather than copying the password into every resource:

```
# Defined once at project level in Coolify
SHARED_DB_HOST, SHARED_DB_PORT, SHARED_DB_ROOT_PASSWORD

# In each application's variables
DB_HOST     = {{project.SHARED_DB_HOST}}
DB_PORT     = {{project.SHARED_DB_PORT}}
DB_DATABASE = myapp
DB_USERNAME = myapp
DB_PASSWORD = <per-application secret>
```

Give **each application its own database and its own user**, with grants scoped to that database. A shared *server* is fine; a shared *schema* or a shared superuser is not. It removes the ability to restore one application without touching the others.

### Backups

A Coolify-managed database resource gets scheduled backups to local or S3-compatible storage, with retention. Configure them when you create the resource, not later. Coolify 4.2.0+ also backs up persistent volumes and directory mounts on a schedule — use that for uploaded files rather than writing a cron job.

## 4. Topology C — an external database

The application's compose file contains no database service at all; only variables.

```yaml
services:
  web:
    environment:
      - DB_HOST=${DB_HOST:-127.0.0.1}
      - DB_PORT=${DB_PORT:-3306}
      - DB_NAME=${DB_NAME:-app}
      - DB_USER=${DB_USER:-app}
      - DB_PASSWORD=${DB_PASSWORD}
```

Checklist:

- The default (`127.0.0.1`) must be one that *fails safely* rather than silently connecting to something wrong.
- Network path: a private address the container can reach, and firewall rules that admit the application server. Verify from inside the container, not from the host.
- TLS: if the provider requires it, the CA bundle has to be in the image or mounted as a file.
- Connection limits: several containers, each with a pool, plus a queue worker, plus a scheduler, multiply quickly. Count them against the server's `max_connections`.

Verify from the container, which is the only place that proves the path works:

```sh
docker exec <app-container> sh -c 'nc -zv $DB_HOST $DB_PORT'
docker exec <app-container> sh -c 'getent hosts $DB_HOST'
```

## 5. Sharing a Redis between applications

Sharing one Redis is reasonable, but only with explicit isolation. Without it, one application's cache flush wipes another's sessions.

Isolate by, in order of preference:

1. **Separate logical databases** — `redis://host:6379/0`, `/1`, `/2`. Cheap and total, but note that Redis Cluster supports only db 0, so this does not survive a move to a cluster.
2. **Key prefixes** — every framework supports one (`CACHE_PREFIX` in Laravel, `$settings['cache_prefix']` in Drupal). Mandatory even when using separate databases; it makes `KEYS`/`SCAN` output legible.
3. **Separate instances** — different containers, different ports. The right answer when workloads differ in kind rather than just in tenant.

Do not put these on the same Redis instance:

- **A cache and a queue.** The cache wants `allkeys-lru` eviction and no persistence; a queue must never have its jobs evicted and usually wants persistence. `allkeys-lru` on a shared instance will silently drop queued jobs under memory pressure. If they must share, use `volatile-lru` and set TTLs only on cache keys.
- **Sessions and an evictable cache.** Same reason — evicted sessions log users out at random, and the correlation with memory pressure is very hard to spot.

When multiple stacks each run their own Redis on one host, they do not collide as long as no one publishes ports. If a port must be published for an external tool, give each instance a distinct port and pass it through: `command: redis-server --port 6380` with `REDIS_PORT=${REDIS_PORT:-6380}`.

## 6. Reaching services on the host

Some dependencies live on the host rather than in Docker — a local Postfix or Sendmail listening on port 25 is the common case. Map the host gateway:

```yaml
services:
  web:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - MAIL_MAILER=${MAIL_MAILER:-smtp}
      - MAIL_HOST=${MAIL_HOST:-host.docker.internal}
      - MAIL_PORT=${MAIL_PORT:-25}
```

Caveats:

- The host service must listen on the Docker bridge address, not only `127.0.0.1`, and must be configured to relay for the bridge subnet.
- This is a deliberate hole through the container boundary. Keep it to services that genuinely belong on the host.
- Because the variables are written in interpolation form, switching to a hosted SMTP provider later is a UI change with no redeploy of code: point `MAIL_HOST`/`MAIL_PORT`/credentials elsewhere.

## 7. Shared search (Solr, Elasticsearch, Meilisearch)

Same reasoning as a database. Prefer one instance with **one core/index per application**, credentials per application, and the host, port and core all supplied as variables:

```yaml
environment:
  - SOLR_HOST=${SOLR_HOST:-solr}
  - SOLR_PORT=${SOLR_PORT:-8983}
  - SOLR_CORE=${SOLR_CORE:-default}
```

When running an in-stack Solr, precreate the core from configuration committed to the repository so the container is reproducible:

```yaml
solr:
  image: solr:9
  restart: unless-stopped
  environment:
    - SOLR_JAVA_MEM=-Xms128m -Xmx384m
  command: ["solr-precreate", "${SOLR_CORE:-default}", "/opt/solr/solrconf"]
  volumes:
    - solr-data:/var/solr
    - ./solrconf:/opt/solr/solrconf/conf:ro
```

Size the JVM heap explicitly. A default-configured Solr will happily take more memory than the rest of the stack combined.

## 8. Review checklist

- [ ] No `networks:` block; cross-stack connectivity uses "Connect to Predefined Network"
- [ ] No published ports on databases, caches, or search
- [ ] Each application has its own database and user on a shared server
- [ ] Shared credentials come from `{{project.*}}` / `{{team.*}}` variables
- [ ] Cache and queue are not sharing an instance with an eviction policy that can drop jobs
- [ ] Key prefixes or separate logical databases isolate shared Redis tenants
- [ ] `maxmemory` and JVM heap are set explicitly, not left at defaults
- [ ] Backups are configured on the database resource and on any volume holding uploads
- [ ] Connectivity verified from inside the container, not from the host

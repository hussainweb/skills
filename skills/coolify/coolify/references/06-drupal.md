# Drupal on Coolify

Read `05-php-applications.md` first — everything there applies. This file covers what is Drupal-specific.

## 1. Configuration from the environment

Drupal's `settings.php` is code, so reading the environment is straightforward. Keep it in a separate, committed file included from `settings.php`, so the environment contract is one readable artefact:

```php
// web/sites/default/settings.php
if (file_exists($app_root . '/' . $site_path . '/settings.env.php')) {
  include $app_root . '/' . $site_path . '/settings.env.php';
}
```

```php
// web/sites/default/settings.env.php
if (getenv('DB_NAME')) {
  $databases['default']['default'] = [
    'driver'   => 'mysql',
    'database' => getenv('DB_NAME'),
    'username' => getenv('DB_USER'),
    'password' => getenv('DB_PASSWORD'),
    'host'     => getenv('DB_HOST'),
    'port'     => getenv('DB_PORT') ?: '',
  ];
}

if (getenv('HASH_SALT')) {
  $settings['hash_salt'] = getenv('HASH_SALT');
}

if (getenv('SOLR_HOST')) {
  $c = &$config['search_api.server.solr']['backend_config']['connector_config'];
  $c['host'] = getenv('SOLR_HOST');
  $c['port'] = getenv('SOLR_PORT');
  $c['core'] = getenv('SOLR_CORE');
}
```

Guard every block on the presence of its primary variable, so the same file works locally, in DDEV, and on Coolify. Note that `${VAR:-}` in the compose file yields a **set-but-empty** variable, and `getenv()` returns `''` rather than `false` for it — `if (getenv('X'))` handles that correctly, but `if (getenv('X') !== FALSE)` does not.

The corresponding compose block:

```yaml
environment:
  - DB_NAME=${DB_NAME:-drupal}
  - DB_USER=${DB_USER:-drupal}
  - DB_PASSWORD=${DB_PASSWORD:-drupal}
  - DB_HOST=${DB_HOST:-127.0.0.1}
  - DB_PORT=${DB_PORT:-3306}
  - HASH_SALT=${HASH_SALT}
  - REVERSE_PROXY=${REVERSE_PROXY:-true}
  - TRUSTED_HOST_PATTERNS=${TRUSTED_HOST_PATTERNS:-}
  - REDIS_HOST=${REDIS_HOST:-redis}
  - REDIS_PORT=${REDIS_PORT:-6379}
  - SOLR_HOST=${SOLR_HOST:-solr}
  - SOLR_PORT=${SOLR_PORT:-8983}
  - SOLR_CORE=${SOLR_CORE:-default}
```

`HASH_SALT` has no default deliberately. A shared default hash salt across environments is a security problem, and a generated-per-deploy one invalidates every session and one-time login link.

## 2. Reverse proxy

```php
if (getenv('REVERSE_PROXY') === 'true' || getenv('REVERSE_PROXY') === '1'
    || (!empty($_SERVER['HTTP_X_FORWARDED_FOR']) && !getenv('IS_DDEV_PROJECT'))) {
  $settings['reverse_proxy'] = TRUE;
  if (!empty($_SERVER['REMOTE_ADDR'])) {
    $settings['reverse_proxy_addresses'] = [$_SERVER['REMOTE_ADDR']];
  }
}
```

Trusting `REMOTE_ADDR` is only sound because the container is unreachable except through Traefik — which is precisely why `ports:` must not appear in the compose file. If the web server is *also* configured to resolve the client from `X-Forwarded-For` (see the `trusted_proxies` warning in `05-php-applications.md` §1), this same code starts trusting the client and lets it spoof `X-Forwarded-Proto`.

## 3. `trusted_host_patterns` — two failure modes, one in each direction

`$settings['trusted_host_patterns']` takes **regular expressions**, so the format of the variable feeding it must be pinned down and the code must not transform it.

- **`preg_quote`ing an operator-supplied value** turns a legitimate regex such as `^www\.example\.com$` into a pattern that matches nothing, producing **400 on every request**.
- **An empty list is worse.** It is Drupal's documented way of saying "do not check", so every `Host` header returns 200 — host-header injection, reported by nothing.

Pick one contract, document it in `.env.example`, and implement exactly that. The simplest workable choice is a comma-separated list of full patterns:

```php
if (getenv('TRUSTED_HOST_PATTERNS')) {
  $settings['trusted_host_patterns'] = array_map('trim', explode(',', getenv('TRUSTED_HOST_PATTERNS')));
}
```

```
TRUSTED_HOST_PATTERNS=^example\.com$,^www\.example\.com$
```

**Test it positively.** An untrusted `Host` must return 400:

```sh
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: evil.example' https://<your-host>/   # expect 400
```

A test that only checks the real hostname returns 200 in both the working and the wide-open case.

## 4. Redis

Drupal's Redis module needs a bootstrap container definition to be usable before the module is enabled, which matters on a first deploy against an empty database:

```php
if (getenv('REDIS_HOST')) {
  $settings['cache']['default'] = 'cache.backend.redis';
  $settings['redis.connection']['host'] = getenv('REDIS_HOST');
  $settings['redis.connection']['port'] = getenv('REDIS_PORT');

  $settings['container_yamls'][] = 'modules/contrib/redis/redis.services.yml';
  $settings['container_yamls'][] = 'modules/contrib/redis/example.services.yml';
  $class_loader->addPsr4('Drupal\\redis\\', 'modules/contrib/redis/src');

  $settings['bootstrap_container_definition'] = [
    'parameters' => [],
    'services' => [
      'redis.factory' => ['class' => 'Drupal\redis\ClientFactory'],
      'cache.backend.redis' => [
        'class' => 'Drupal\redis\Cache\CacheBackendFactory',
        'arguments' => ['@redis.factory', '@cache_tags_provider.container', '@serialization.phpserialize'],
      ],
      'cache.container' => [
        'class' => '\Drupal\redis\Cache\PhpRedis',
        'factory' => ['@cache.backend.redis', 'get'],
        'arguments' => ['container'],
      ],
      'cache_tags_provider.container' => [
        'class' => 'Drupal\redis\Cache\RedisCacheTagsChecksum',
        'arguments' => ['@redis.factory'],
      ],
      'serialization.phpserialize' => ['class' => 'Drupal\Component\Serialization\PhpSerialize'],
    ],
  ];
}
```

Set `$settings['cache_prefix']` when the Redis instance is shared with anything else. See `04-shared-infrastructure.md` §5.

## 5. Deployment steps

**`drush deploy` is not always usable.** It runs `config:import` against `config_sync_directory`. If that directory is a hand-curated partial list rather than a full `drush cex` export, it carries no site UUID and the step fails:

```
Site UUID in source storage does not match the target storage.
```

Where that is the case, run the individual steps in the post-deployment command instead:

```sh
drush updatedb -y && drush cache:rebuild
# plus whatever mechanism this codebase uses to apply configuration
```

Where a full export *is* committed, `drush deploy` is the right call.

Post-deployment commands run as the container's own user, not root — a script that also repairs file ownership must cope with that.

## 6. Block `/core/install.php`

On an empty database Drupal redirects everything to the installer. The installer is open by construction — there is no configuration yet, so no application-level protection can exist — and its steps advance on `GET`, so a single `curl -L` is enough to write a partial install. Block it at the web-server layer:

```
# Caddy
@installer path /core/install.php /core/install.php/*
respond @installer 403
```

Note that this makes the first-deploy health check see 403 rather than 302 — which the health check in `05-php-applications.md` §4 already accepts.

## 7. "No PHP here" rules must cover the directory, not a path with a segment in it

Two commonly copied patterns are both wrong:

```
^/sites/[^/]+/files/.*\.php$      # requires a directory after /sites/
^/sites/.*/settings.*\.php$       # also requires a directory after /sites/
```

Neither covers a file sitting **directly** in `sites/` — which is how `/sites/settings.shared.php` ended up being executed. The rule is:

```
^/sites/.*\.php$
```

Verify by requesting a file you know exists there and confirming a 403, not by reading the configuration.

## 8. After importing a database from another machine, clear the asset aggregation registry

A dump carried from another host points at `files/css/css_<hash>.css` paths that do not exist on the new one. Every aggregate then 400s, and every shared CSS token resolves to nothing — the header, footer and navigation do not render, **on a page that still returns 200 with correct markup and a correct palette**, because inline styles survive. It looks like a theme bug.

`drush cr` does **not** fix it. This does:

```sh
drush ev 'foreach (["asset.css.collection_optimizer","asset.js.collection_optimizer"] as $s) {
  \Drupal::service($s)->deleteAll(); }
  \Drupal::state()->set("system.css_js_query_string", base_convert((string) time(), 10, 36));'
drush cr
```

Put it in a script in the repository. Quoting that through `docker exec` is how it gets skipped, and its failure mode is invisible.

## 9. Files and volumes

```yaml
volumes:
  - drupal-files:/app/web/sites/default/files
  - drupal-private:/app/private_files
```

- Public files and private files are separate volumes. `file_private_path` must point outside the docroot.
- Do not mount `sites/default/` itself; `settings.php` comes from the image.
- Enable Coolify's scheduled volume backups for both.
- Translations, aggregated CSS/JS and image styles all regenerate, but the *originals* under `files/` do not. That volume is the one that matters.

## 10. Cron

Use a Coolify **Scheduled Task** running `drush cron` against the web container, rather than Drupal's automated cron (which fires on a page request and makes a visitor pay for it) or a sidecar loop. Disable automated cron in configuration so the two do not overlap.

If a sidecar container is used instead, it inherits the web image's `HEALTHCHECK`, does not listen on the port, and will report `unhealthy` forever. `healthcheck: {disable: true}`.

## 11. Multisite

A codebase that supports multisite can be deployed as a **single site** per Coolify resource, which is usually what you want: one domain, one database, one set of variables, independent deploys and rollbacks.

If it is deployed as a genuine multisite, note that the health check's `Host` header now determines which site directory `sites.php` resolves to. `Host: 127.0.0.1` matches nothing and silently falls back to `sites/default` — so the check can pass while the site you care about is broken.

## 12. Review checklist

- [ ] `settings.env.php` guards every block on its primary variable
- [ ] `HASH_SALT` supplied by Coolify, stable, no default
- [ ] `TRUSTED_HOST_PATTERNS` format documented and tested with an untrusted `Host` returning 400
- [ ] `reverse_proxy` on; web server not resolving the client from `X-Forwarded-For`
- [ ] Redis bootstrap container definition present if Redis is the default cache
- [ ] `cache_prefix` set when Redis is shared
- [ ] `/core/install.php` blocked
- [ ] "No PHP" rule is `^/sites/.*\.php$`
- [ ] Post-deploy runs `updatedb` + config application + `cache:rebuild`, and does not assume `drush deploy` works
- [ ] Public and private files on separate volumes, both backed up
- [ ] Cron runs as a Coolify scheduled task, automated cron disabled

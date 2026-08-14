# Coolify Skill References

Reference files for the Coolify deployment and operations skill.

## Reference Index

| File | Topic |
|---|---|
| `01-architecture-and-versions.md` | What Coolify is, control plane vs application servers, resource hierarchy, establishing the running version, recent breaking changes, introspecting Coolify's own database |
| `02-docker-compose.md` | The Docker Compose build pack — what Coolify rewrites, hard rules (no custom networks, no published ports), domains and routing, magic `SERVICE_*` variables, volumes, health checks, the three compose shapes |
| `03-environment-variables.md` | The `${VAR:-default}` convention that makes settings editable in the UI, variable-store drift, build vs runtime variables, shared `{{project.*}}` variables, literal and multiline values, predefined `COOLIFY_*` variables |
| `04-shared-infrastructure.md` | Shared databases, Redis and search — in-stack vs Coolify-managed vs external, "Connect to Predefined Network", tenant isolation, reaching host services |
| `05-php-applications.md` | PHP on Coolify — FrankenPHP and php-fpm, Dockerfile patterns, Laravel config cache, queue workers, health checks that do not lie, persistence |
| `06-drupal.md` | Drupal specifics — `settings.env.php`, `trusted_host_patterns`, Redis bootstrap, deployment steps, blocking the installer, post-import asset registry reset, cron |
| `07-github-actions-deployment.md` | CI to Coolify — build-on-server vs build-in-CI, GHCR authentication on the destination server, the full four-job workflow, image pruning, the POST-only deploy trigger |
| `08-troubleshooting.md` | Method, symptom → check → cause table, diagnostic toolkit, a worked example of five wrong theories, open questions |

## Reading order

- **New project:** 01 → 02 → 03 → 04 → (05, 06) → 07
- **Debugging:** 08, then whichever of 02 / 04 / 05 the check points at
- **Reviewing a compose file:** 02 and 03, checklists at the end of each

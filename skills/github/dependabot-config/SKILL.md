---
name: dependabot-config
description: Write or review `.github/dependabot.yml` the way this author does — weekly schedules with no pinned time or timezone, every ecosystem in the repo covered, and dependencies grouped by release family so a week's updates arrive as a handful of PRs instead of dozens. Use this skill whenever a Dependabot config is being created, edited, reviewed, or copied into a new repo; when setting up automated dependency updates for a project; or when the user says "dependabot config", "dependabot.yml", "set up dependabot", "group the dependabot PRs", "too many dependabot PRs", or asks why a dependency is not being updated. Covers composer (Drupal and Laravel), npm, github-actions, docker-compose, pip/uv, and gomod, plus grouping, cooldown, and multi-directory setups. Not for merging Dependabot PRs — that is merge-dependabot-prs.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
metadata:
  authors: "Hussain Abbas"
  version: "1.0.0"
---

# Dependabot config

A Dependabot config is read far more often than it is written, and it is read when
something is wrong — a flood of PRs on a Monday, or a package that never gets bumped.
Write it so both questions are answerable from the file itself.

Two things carry most of the value: a **plain weekly schedule**, and **groups that match
how the packages actually release**. Everything else is detail.

## Non-negotiables

| Rule | Why |
|---|---|
| `interval: weekly` | Daily is noise. Weekly is the rhythm dependency review actually happens on. |
| No `day:`, `time:` or `timezone:` unless asked for | See below — they are defaults to leave alone, not keys to fill in. |
| Every ecosystem in the repo gets an entry | A config that covers `npm` but not `github-actions` silently rots the CI pipeline. |
| Nothing ungrouped that has a family | Ungrouped means one PR per package per week. |
| `version: 2` at the top | v1 is long dead. |

### The scheduling keys to leave alone

`day:`, `time:` and `timezone:` are all **off by default**. Never add one on your own
initiative, and never carry one over when copying a config from another repo — that is
how they spread. The schedule should be two lines:

```yaml
schedule:
  interval: weekly
```

The reasoning, so it can be explained rather than just asserted:

- **`time:`** — a pinned hour buys nothing. Nobody is waiting at their desk for the PRs,
  and it makes the file look precise about something that does not matter.
- **`timezone:`** — it exists only to qualify `time:`. Without `time:` it is dead config.
- **`day:`** — weekly without a day already runs on Monday, which is fine.

**When the user explicitly asks for one, set it.** This is a default, not a prohibition,
and the user knows their own reasons — a team that reviews dependencies on a Friday, a
release window to stay clear of, two noisy repos that should not land on the same
morning. Do not argue the point or re-raise it later; just write what was asked for:

```yaml
# Fine, because it was asked for.
schedule:
  interval: weekly
  day: friday
  time: "09:00"
  timezone: "Asia/Kolkata"
```

Two things to get right when honouring such a request:

- `time:` is UTC unless a `timezone:` accompanies it, so a request phrased in local time
  needs the `timezone:` too. Say so rather than silently writing a UTC hour.
- Apply it to *every* entry in the file, not just the one being edited. A file where
  composer runs Friday and github-actions runs Monday is the worst of both.

Dependabot also accepts `monthly`, `quarterly`, `semiannually`, `yearly`, and a raw
`cron` expression, and GitHub's own guidance now leans monthly as a default. Weekly is
the deliberate choice here: GitHub's case for monthly is PR volume, and grouping solves
that more precisely without letting a month's drift accumulate. GitHub's own wording
allows for it — weekly suits fast-moving applications.

The one place `interval: monthly` earns its keep is a secondary directory that barely
moves — a theme's build tooling, say — where weekly would just be churn. Never use it for
the primary manifest, and never reach for `quarterly` or slower.

None of this delays security fixes. Security updates ignore the schedule, the cooldown,
and `open-pull-requests-limit` entirely; slowing routine version updates never holds a
vulnerability fix back.

## Building the file

1. **Find the manifests.** Look for `composer.json`, `package.json` (in *every*
   directory — themes and test suites count), `Dockerfile`/`docker-compose.yml`,
   `requirements.txt`/`pyproject.toml`/`uv.lock`, `go.mod`, and `.github/workflows/`.
2. **One `updates:` entry per ecosystem per directory** — unless `directories:` can
   collapse them, see below.
3. **Read the actual dependency list** before writing groups. Groups are only useful if
   they name families that are really in the manifest — do not paste a React group into a
   repo that has no React.
4. **Order entries** by what the repo is mostly about: primary language first,
   `github-actions` last. It is the one entry every repo has, so it reads as a footer.
5. **Keep quoting consistent within the file.** Double quotes throughout, or bare scalars
   throughout — matching whatever is already there when editing. Do not mix.

### `directory` vs `directories`

`directories:` takes a list and supports `*` globbing; `directory:` takes one path and
does not. Use `directories:` when several paths want *identical* treatment:

```yaml
  - package-ecosystem: "npm"
    directories:
      - "/web/themes/custom/*"
    schedule:
      interval: "weekly"
```

Keep them as separate `directory:` entries when they deserve different groups, prefixes,
or cadence — a theme build and a Playwright suite are different jobs and reviewing them
in one PR is worse, not better. Collapsing is for sameness, not for brevity.

## Grouping

The goal is that a week's worth of updates is a handful of reviewable PRs. Group packages
that are **released in lockstep** or that **must move together to still work** — those
are the ones where a single-package PR would fail CI anyway.

Ways to select, usable together:

- `patterns:` / `exclude-patterns:` — by name. The workhorse.
- `dependency-type: development` or `production` — a good catch-all for whatever is left.
  Supported on composer, npm, bundler, mix, maven, and pip.
- `update-types: [minor, patch]` — keeps majors out of the group so each one arrives as
  its own PR with its own changelog. Worth adding on any group large enough that a
  bundled major would be hard to spot.
- `group-by: dependency-name` — for a monorepo where the same package is pinned in
  several directories, collapsing what used to be one near-identical PR per directory.

The docs are explicit about precedence: "If a dependency matches more than one rule, it's
included in the first group that it matches." So a broad pattern must either come after
the narrow ones or carve them out explicitly. The Drupal case below does the latter —
`drupal/*` excludes `drupal/core*` — and that explicit exclusion is the more readable of
the two, because it does not depend on the reader knowing that order matters.

Name groups after the family, not the mechanism: `drupal-core`, `react`, `linters` — not
`group-1` or `weekly-npm`.

### Groups and security updates

A group applies to version updates only unless told otherwise. `applies-to:` takes
`version-updates` (the default) or `security-updates`. Leave it alone by default:
security PRs arriving one per advisory is a feature, because each one wants reading on
its own. Add a `security-updates` group only in a repo whose advisory volume has become
genuinely unreviewable.

### Canonical groups

Reach for these first; they are the ones that recur across this author's repos. Full
copy-paste blocks are in `references/ecosystem-blocks.md`.

**Drupal (composer)** — core alone, contrib as a batch, dev tooling as a batch:

```yaml
groups:
  drupal-core:
    patterns:
      - "drupal/core*"
  drupal-projects:
    patterns:
      - "drupal/*"
    exclude-patterns:
      - "drupal/core*"
  dev-dependencies:
    dependency-type: "development"
```

Pair it with `versioning-strategy: increase-if-necessary` — Drupal sites carry
constraints that should be widened only when a bump actually requires it.

**GitHub Actions** — official actions move together and are safe to bump as one, majors
included:

```yaml
groups:
  github-actions:
    patterns:
      - "actions/*"
  docker-actions:
    patterns:
      - "docker/*"
```

For a small repo whose workflows use only a handful of actions, a single
`patterns: ["*"]` group is fine and better than nothing.

**npm** — group by framework family, then by toolchain role. Typical families: React
(`react`, `react-dom`, and both `@types/`), Next, Astro (`astro` + `@astrojs/*`), Vite,
Tailwind, Drizzle, Playwright, linters (`eslint*`, `stylelint*`, `@biomejs/*`),
`@types/*`, and test runners.

**Laravel (composer)** — `laravel/*` plus `illuminate/*`, then Filament/Spatie/testing.

### When a group is wrong

- A group whose patterns match one package is just a slower way of writing nothing.
  Fold it into a neighbour.
- A group that mixes unrelated families produces a PR nobody can review. Split it.
- A catch-all `dependency-type: development` group is good *last*, after the named
  families have claimed what they need.

## Cooldown

Dependabot waits three days after a release before opening a version-update PR. That is
the default and needs no configuration, so **do not write a `cooldown:` block that only
restates it**. It exists so a bad release gets yanked before it reaches a PR.

Configure it only to lengthen the wait where the risk is real — typically majors on a
production application:

```yaml
    cooldown:
      semver-major-days: 14
```

Other keys are `default-days`, `semver-minor-days`, `semver-patch-days`, and
`include`/`exclude` lists (wildcards allowed, up to 150 entries each, with `exclude`
winning over `include`). Cooldown never applies to security updates.

Note the interaction with grouping: a long cooldown on majors means a major arrives well
after its minors, which is usually what is wanted — but it also means "why has nothing
bumped" can have a boring answer. Check the cooldown before hunting for a bug.

## Other keys, and when they earn a place

- **`commit-message.prefix`** — set it when the repo's history uses prefixed dependency
  commits. The established prefixes are `Composer` (with `include: "scope"`), `npm`,
  `github-actions`, and `go`. When a repo has two npm entries, scope the second:
  `npm(test)`. Do not invent a new prefix scheme for a repo that already has one.
- **`open-pull-requests-limit: 10`** — for application repos with large dependency trees.
  Skip it on small repos; the default of 5 is fine there. Setting it to `0` disables
  version updates entirely while leaving security updates on — a blunt instrument, but
  the honest way to pause a repo rather than letting PRs pile up unread.
- **`versioning-strategy`** — `increase-if-necessary` on Drupal composer entries.
  Otherwise leave it unset and let Dependabot choose.
- **`labels:`** — only in a repo that already routes on labels. Otherwise it is noise.
- **`ignore:`** — a last resort, and always with a comment saying what has to change
  before it can go. An `ignore` with no reason attached outlives its reason. Prefer a
  cooldown or an `update-types` split when the real problem is timing rather than
  incompatibility.
- **`multi-ecosystem-group`** — bundles updates across ecosystems into one PR. Almost
  never right: a PR spanning composer and npm fails review, because the person who
  understands one half rarely understands the other.

Everything not listed here is almost certainly unnecessary. A good config for a small
repo is about twelve lines.

## Comments

Comment the non-obvious only: why a group exists, why a version is pinned back, why a
directory is separate. Do not comment what the key already says —
`# Check for updates weekly` above `interval: weekly` is worse than nothing, because it
takes a line of attention and returns none.

## Reviewing an existing config

Walk it in this order:

1. Any `day:`, `time:` or `timezone:`? Drop them — unless the user says they want that
   schedule, in which case make it consistent across every entry instead.
2. `interval` anything other than `weekly`? Justify or fix.
3. Manifest in the repo with no matching entry? Add it — check theme and test
   subdirectories, they are the ones usually missed.
4. Entry with no `groups:` and more than a few dependencies? Group it.
5. Group patterns that match nothing in the current manifest? Stale — the dependency was
   removed or renamed. Drop the group.
6. A broad pattern sitting before a narrow one that it swallows? Reorder or exclude.
7. A `cooldown:` block that only repeats the three-day default? Delete it.

When the complaint is "this package never updates", check in order: an `ignore` entry, a
cooldown still running, `open-pull-requests-limit` already saturated, a group whose PR is
open and blocked, and only then the manifest's own version constraint.

## Related

Grouping is what makes `merge-dependabot-prs` pleasant: a well-grouped repo produces a
few green PRs a week that batch-merge cleanly, and holds each major back on its own for a
human to read. A config with no groups turns that skill into a long afternoon.

Reference: [Dependabot options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference).

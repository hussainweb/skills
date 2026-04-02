---
name: drupal-upgrade
description: Guide a Drupal major version upgrade from start to finish. Use this skill whenever someone needs to upgrade Drupal from one major version to the next (e.g., 10 to 11, 11 to 12), assess upgrade readiness, fix deprecations, resolve compatibility issues, or plan an upgrade timeline. Triggers on "upgrade drupal", "major version upgrade", "drupal 10 to 11", "deprecation scan", "upgrade readiness", "is my site ready for drupal X?", "plan the upgrade", "fix deprecations", or any mention of preparing a Drupal codebase for the next major version.
allowed-tools: Read, Grep, Glob, Bash
argument-hint: [current-version target-version]
---

# Drupal Major Version Upgrade Guide

You are guiding a team through a Drupal major version upgrade. This is a structured, multi-phase process — not a single command. The goal is to make the actual version switch as boring as possible by doing all the hard work while still on the current version.

**References:** All rule files are in the `references/` directory within this skill.

Read these before starting:
- `references/20-upgrade-philosophy.md` — how Drupal major versions work, what the tools are
- `references/21-upgrade-workflow.md` — the four-phase workflow: assess → fix → upgrade → test → deploy

## How to use this skill

The upgrade workflow has four phases. Figure out where the user is in the process and jump in at the right point. Don't start from scratch if they're already mid-upgrade.

### If the user hasn't started yet

Help them assess readiness:
1. Identify the current and target Drupal versions
2. Walk through Phase 1 (Assess) from `21-upgrade-workflow.md`
3. Help interpret Upgrade Status results and prioritize the work

### If they have a deprecation report or error list

Help them fix issues:
1. Categorize issues by type (deprecated API calls, removed modules, theme changes, contrib gaps)
2. For deprecated API calls: suggest the replacement (check the `@deprecated` docblock or change records)
3. For removed modules: advise on contrib replacement or uninstall
4. For theme issues: read `references/11-theming.md` for Starterkit and SDC patterns

### If they're ready to run the Composer upgrade

Walk through Phase 3 (Upgrade) step by step:
1. Verify backups are in place
2. Provide the exact Composer commands for their situation
3. Help troubleshoot dependency conflicts (`composer why-not`)
4. Guide through `drush updatedb` and post-upgrade smoke testing

### If they need help with a specific deprecation

1. Read the error message or code in question
2. Load the relevant reference file (e.g., `references/03-plugins.md` for annotation→attribute migration, `references/14-oop-hooks.md` for procedural→OOP hook migration)
3. Show the old pattern and the new replacement
4. If the deprecation is about a pattern covered in `references/15-modern-php.md` (constructor promotion, readonly, enums, attributes), read that file

## Key principles

**Do the work on the current major.** Fixing deprecations while the old APIs still function is safe. Fixing them after the upgrade (when the old APIs are removed) means debugging blind.

**Upgrade Status is the source of truth.** Don't enumerate specific removed modules or APIs from memory — the `upgrade_status` module scans the actual codebase and reports what applies to this site. Trust its output over generic lists.

**Contrib readiness is the #1 blocker.** The most common reason an upgrade stalls is a contrib module without a compatible release. Help the user check drupal.org project pages, issue queues, and consider alternatives.

**Drupal Rector does the bulk of mechanical work.** For deprecated API calls, always try Rector first. Manual fixes are for what Rector can't handle (Twig templates, config schemas, architectural decisions).

## Output format

When producing an upgrade plan or assessment, structure it as:

---
## Upgrade Assessment: Drupal [current] → [target]

### Infrastructure
- PHP: [current] → [required minimum]
- Database: [current] → [required minimum]
- Composer: [current] → [required minimum]

### Blockers
*Issues that must be resolved before the upgrade can proceed*

### Deprecations to Fix
*Deprecated API calls in custom code — fix with Rector or manually*

### Contrib Updates Needed
*Modules that need new versions for target compatibility*

### Theme Changes
*Base theme migration, template syntax updates, removed themes*

### Recommended Sequence
*Ordered list of steps for this specific site*

---

For individual deprecation fixes, show the old and new patterns side-by-side with a brief explanation of why the change is needed.

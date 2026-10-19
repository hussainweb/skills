# Documentation index

How to fill a Grounded Docs server with the documentation a project's stack needs, at the versions the project uses. Load this file only when the user has opted into the server, as `agent.md` describes.

The server does the crawling, conversion and search. It does not know where a library's documentation lives, and a crawl with the wrong start URL or scope reports `completed` after indexing one page. The recipes below are the settings that are known to work; do not improvise a crawl for a framework that has one.

## The loop

1. **Versions.** Read each framework's version from the detect script: `drupal.core`, `laravel.framework`, and `js[<dir>].frameworks`, which prints the declared range and the installed version. Prefer the installed or locked version over the range.
2. **What is indexed.** Call `list_libraries`, then `find_version` with `targetVersion` set to `<major>.x` for each framework. A version counts as indexed only when the major matches; `find_version` and `search_docs` fall back to the closest older version, so a project on Laravel 13 is served Laravel 12 without a warning.
3. **Offer the missing ones.** List each missing framework and version with its recipe in one line, and scrape only the ones the user agrees to. The index is shared by everyone who uses the server, so a scrape is not a private change.
4. **Scrape** with `scrape_docs`, using the recipe's arguments. It returns a job ID; poll `get_job_info` until the status is `completed` or `failed`. A large site takes several minutes.
5. **Verify.** `completed` does not mean it worked. Run each of the recipe's check queries with `search_docs` and confirm the results come from the expected paths. When the server has `list_pages`, also check the page count is in the recipe's range. A failed check means the crawl went wrong: remove the version with `remove_docs` and report it rather than leaving a broken index.

## Naming

- **Library:** the recipe's name, lower case, with no version in it. `laravel@12` is a library called `laravel@12`, not version 12 of `laravel`.
- **Version label:** `<major>.0.0` for documentation published once per major, such as Laravel's. `scrape_docs` takes the label literally, while `search_docs` treats it as semver, so the label must parse as one.
- **Searching:** pass `version: "<major>.x"`. Never omit the version, which means the newest indexed one.

Write these two rules into the project's `AGENTS.md` as one line when the user agrees, so later sessions search with the right version without loading this file.

## Recipes

Each recipe states the arguments for `scrape_docs`, the check queries, and the date it was last tested.

### Laravel

- **Skip when** Laravel Boost is present: its documentation tool already searches the framework's docs by version. Offer the recipe only without Boost, or when the user asks.
- **Library:** `laravel`, version `<major>.0.0`.
- **Arguments:**

```json
{
  "url": "https://laravel.com/framework/docs/<major>.x",
  "library": "laravel",
  "version": "<major>.0.0",
  "maxDepth": 2,
  "scope": "hostname",
  "includePatterns": "/^https:\\/\\/laravel\\.com\\/framework\\/docs\\/<major>\\.x/"
}
```

- **Why these settings:** `laravel.com/docs/<major>.x` redirects to `/framework/docs/<major>.x`, and with the default `subpages` scope the crawl stays under the old path and indexes one page. `hostname` scope with the include pattern follows the redirect and keeps the crawl to one major.
- **Check queries:** "route parameter regular expression constraint" from `/routing`, "eloquent eager loading relationships" from `/eloquent-relationships`, "queue job retry backoff" from `/queues`.
- **Known noise:** code blocks arrive twice, once with line numbers run into the code. Search still works; results cost more tokens.
- **Tested:** 2026-10-19, Laravel 12.

### Next.js

- **Library:** `nextjs`, version `<major>.0.0`.
- **Router:** index `/docs/app` for the App Router and `/docs/pages` for the Pages Router, the one the project uses. An `app/` or `src/app/` directory means the App Router.
- **Arguments:**

```json
{
  "url": "https://nextjs.org/docs/app",
  "library": "nextjs",
  "version": "<major>.0.0",
  "maxDepth": 3
}
```

  Keep the default `maxPages` of 1000. A 60-page crawl indexed the guides but stopped before the API reference.
- **Older majors:** the site says older versions are published at `/docs/<major>/...`. Untested; use that start URL for a project behind the current major, and check the results' URLs carry the version.
- **Check queries:** "server actions revalidate cache" from `/getting-started/revalidating`, "generateStaticParams" with a result from `/api-reference/`.
- **Tested:** 2026-10-19, the current docs (Next.js 16). The site serves Markdown and an `llms.txt`, so pages arrive clean.

### Drupal

- **Status: unsettled.** No tested recipe yet. Say so in the report rather than attempting a crawl.
- **What fails** (tested 2026-10-19):
  - `www.drupal.org` and `api.drupal.org` answer the scraper with a Fastly bot-challenge page. A crawl would index the challenge page and report `completed`. Do not try to get past the challenge.
  - Scraping `github.com/drupal/core/tree/<branch>` indexed no documents, with or without include patterns, on a server older than v3.3.0. Retest on a current server before concluding the GitHub route is closed.
  - A zip archive URL fails with `no pipeline can read it`; archives are read only from local paths.
- **Likely route:** a checkout of `drupal/core` at the project's branch (such as `12.0.x`) on the server's host, indexed through a `file://` URL. The folder must be in the server's allowed roots (`DOCS_MCP_SCRAPER_SECURITY_FILE_ACCESS_ALLOWED_ROOTS`), which is server-side setup only the user can do. The hook documentation lives in `*.api.php` files. Change records stay unreachable on any route, because they live only on drupal.org.

## Adding a recipe

Test it on the server before writing it down: scrape under a throwaway library name, run the check queries, then remove it. Record the arguments, why any non-default setting is there, two or three check queries with their expected paths, and the date and version tested.

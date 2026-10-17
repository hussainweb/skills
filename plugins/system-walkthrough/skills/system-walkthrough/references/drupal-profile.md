# Drupal profile

A Drupal site is one container in the system's context, and then a system of its own: content types, fields, roles, views, custom modules and the request path through routing, access and rendering. This profile adds that layer to a walkthrough. Nothing here changes the page format; it changes where facts come from and which chapters the story gets.

## Detect

`composer.json` requires `drupal/core` or `drupal/core-recommended`, and a docroot (`web/`, `docroot/`, `html/` or `.`) contains `core/lib/Drupal.php`. A config export (`core.extension.yml` under `config/sync`, `config/default` or `config/`) is required; without it the content model and roles are not knowable from the repository, say so and ask for `drush config:export`.

## Extract first, read second

Run the extractor before the inventory agent:

    node <skill>/scripts/extract-drupal.mjs <repo> <walkthrough-dir>

It needs no running site and no dependencies. It writes:

- `drupal-facts.md`: site, modules by origin, every bundle with its fields (type, cardinality, entity-reference targets), roles with a content-operations matrix and grouped permissions, every view display with path and access, blocks and menus, custom modules (hooks, routes, services, plugin types defined, plugins, event subscribers, drush commands, controllers, forms, entity types, permissions, templates, tests), custom themes, cron and queue workers, settings.php env vars and overrides, hosting and CI signals. Each line carries the config or code path to cite.
- `drupal-facts.json`: the same, for tooling.
- `drupal-content-model.d2`: a ready scene with one `entity` shape per bundle and an edge per entity reference. Trim it to the bundles that matter before using it; a site with forty content types needs two or three scenes, grouped by domain.

Give the inventory agent the facts file as an input and tell it to treat the config-derived facts as ground truth and spend its reading on the custom code: what each plugin, subscriber, hook and queue worker actually does, which contrib modules carry real behaviour (workflows, flags, REST resources, social auth, search), and where the docs disagree.

## Chapters to add

After the generic containers chapter, where the site is one box, zoom in with these chapters. Keep the generic surprises and reading-order chapters at the end.

1. **What the site is made of.** Core, contrib and custom module counts, the custom modules as a scene of boundaries with their dependencies, the custom theme. One step per custom module that carries behaviour, naming its hooks, services and plugins.
2. **The content model.** A scene from `drupal-content-model.d2`, revealed bundle by bundle. Say what each bundle is for and which references tie it to the others. Vocabularies are part of this scene; put workflows here too.
3. **Who can do what.** The roles-by-bundle operations table from the facts file goes in the step text as a table; the scene highlights the modules that supply the notable permissions (field_permissions, flag, rest). Then one flow step per interesting role: "an editor publishes X" traced through the form, access check, workflow transition and cache invalidation.
4. **How the site answers a request.** Routing (routing.yml, views page displays, entity routes) → access (permissions, node access, field_permissions) → controller or view → render arrays → render cache and page cache → reverse proxy if any. One scene, one flow dot.
5. **What runs on its own.** hook_cron implementers, queue workers, the cron trigger (automated_cron, system cron, platform cron), scheduled imports, mail. One scene, one flow per job.
6. **Views and listings.** The page and REST displays as the site's listing routes, with access per display. Table in the text, scene optional.

## Evidence conventions

- Config facts cite the config file: `config/sync/node.type.article.yml:1`, `config/sync/user.role.editor.yml:1`.
- Code facts cite the line: `web/modules/custom/x/x.module:42`, `web/modules/custom/x/src/Plugin/QueueWorker/Y.php:18`.
- Views cite the view's config file; a specific display is still the one file.
- A claim about behaviour that lives in a contrib module cites the config that enables it (`core.extension.yml:1`) and, if the behaviour is specific, the contrib file under the docroot.

## Known limits

- The extractor reads the config export, not the database; content, menu links, users and anything in `config_split` disabled splits are invisible. Say so when it matters.
- Permissions are grouped by text patterns; a permission with an unusual name lands in "other".
- Plugin ids are read from annotations or attributes by regex; a plugin that composes its id elsewhere shows as `?`.
- Themes are summarised; a theme-heavy site deserves its own scene of regions and templates.

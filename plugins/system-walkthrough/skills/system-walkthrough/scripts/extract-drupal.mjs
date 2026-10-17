#!/usr/bin/env node
// Deterministic facts about a Drupal site, from its config export and custom
// code, without a running site. Zero dependencies.
//
// Usage: node extract-drupal.mjs <repo> <outdir>
// Writes <outdir>/drupal-facts.md, drupal-facts.json and drupal-content-model.d2.
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, basename, relative, resolve } from 'node:path';

const [repoArg, outArg] = process.argv.slice(2);
if (!repoArg || !outArg) { console.error('usage: extract-drupal.mjs <repo> <outdir>'); process.exit(1); }
const repo = resolve(repoArg), out = resolve(outArg);
mkdirSync(out, { recursive: true });

// ---------------------------------------------------------------------------
// A parser for the YAML dialect Drupal's config export uses (Symfony dumper):
// two-space indents, `key: value`, bare `-` sequences, quoted scalars, block
// scalars, inline `{  }` / `[  ]`. Not a general YAML parser.
function parseYaml(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let i = 0;
  const indentOf = (l) => l.match(/^ */)[0].length;
  const blank = (l) => /^\s*$/.test(l) || /^\s*#/.test(l);
  const skip = () => { while (i < lines.length && blank(lines[i])) i++; };
  const unquote = (s) => {
    s = s.trim();
    if (/^'.*'$/s.test(s)) return s.slice(1, -1).replace(/''/g, "'");
    if (/^".*"$/s.test(s)) { try { return JSON.parse(s); } catch { return s.slice(1, -1); } }
    return s;
  };
  // Split `key: value` at the first colon that is followed by whitespace or the
  // end of the line and sits outside quotes, so URL keys and quoted values work.
  const splitKey = (l) => {
    let q = null;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; continue; }
      if (ch === ':' && (k === l.length - 1 || /\s/.test(l[k + 1]))) return [l.slice(0, k).trim(), l.slice(k + 1)];
    }
    return null;
  };
  const splitTop = (s) => { const parts = []; let depth = 0, cur = '', q = null;
    for (const ch of s) { if (q) { cur += ch; if (ch === q) q = null; continue; } if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if (ch === '{' || ch === '[') depth++; if (ch === '}' || ch === ']') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; } cur += ch; }
    if (cur.trim()) parts.push(cur); return parts; };
  function scalar(s) {
    s = s.trim();
    if (/^\{\s*\}$/.test(s)) return {};
    if (/^\[\s*\]$/.test(s)) return [];
    if (/^\[.*\]$/s.test(s)) return splitTop(s.slice(1, -1)).map((x) => scalar(x));
    if (/^\{.*\}$/s.test(s)) { const o = {}; for (const p of splitTop(s.slice(1, -1))) { const k = p.indexOf(':'); o[unquote(p.slice(0, k))] = scalar(p.slice(k + 1)); } return o; }
    if (/^['"]/.test(s)) return unquote(s);
    if (s === 'null' || s === '~' || s === '') return null;
    if (s === 'true') return true; if (s === 'false') return false;
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d*\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }
  function block(rest, indent) {
    if (/^[|>][-+]?$/.test(rest)) {
      const buf = []; let base = null;
      while (i < lines.length) { const l = lines[i]; if (!blank(l) && indentOf(l) <= indent) break; if (base === null && !blank(l)) base = indentOf(l); buf.push(l.slice(base || 0)); i++; }
      const s = buf.join(rest[0] === '>' ? ' ' : '\n'); return rest.endsWith('-') ? s.replace(/\s+$/, '') : s;
    }
    return scalar(rest);
  }
  function node(indent) {
    skip(); if (i >= lines.length) return null;
    const l = lines[i]; if (indentOf(l) < indent) return null;
    return /^\s*-(\s|$)/.test(l) ? seq(indentOf(l)) : map(indentOf(l));
  }
  function map(indent) {
    const obj = {};
    while (i < lines.length) {
      skip(); if (i >= lines.length) break;
      const l = lines[i], ind = indentOf(l);
      if (ind < indent) break;
      if (ind > indent) throw new Error(`unexpected indent at line ${i + 1}: ${l}`);
      if (/^\s*-(\s|$)/.test(l)) break;
      const m = splitKey(l);
      if (!m) throw new Error(`cannot parse line ${i + 1}: ${l}`);
      const key = unquote(m[0]); const rest = m[1].trim(); i++;
      if (rest === '') {
        skip();
        if (i < lines.length && indentOf(lines[i]) > indent) obj[key] = node(indentOf(lines[i]));
        else if (i < lines.length && indentOf(lines[i]) === indent && /^\s*-(\s|$)/.test(lines[i])) obj[key] = seq(indent);
        else obj[key] = null;
      } else obj[key] = block(rest, indent);
    }
    return obj;
  }
  function seq(indent) {
    const arr = [];
    while (i < lines.length) {
      skip(); if (i >= lines.length) break;
      const l = lines[i]; if (indentOf(l) !== indent || !/^\s*-(\s|$)/.test(l)) break;
      const rest = l.replace(/^\s*-\s?/, ''); i++;
      if (rest.trim() === '') { skip(); arr.push(i < lines.length && indentOf(lines[i]) > indent ? node(indentOf(lines[i])) : null); }
      else if (!/^['"\[{]/.test(rest.trim()) && splitKey(rest)) { lines[i - 1] = ' '.repeat(indent + 2) + rest; i--; arr.push(map(indent + 2)); }
      else arr.push(block(rest.trim(), indent));
    }
    return arr;
  }
  return node(0);
}

// ---------------------------------------------------------------------------
const rel = (p) => relative(repo, p);
const arr = (x) => (Array.isArray(x) ? x : []); // Symfony dumps empty lists as `{  }`
const read = (p) => readFileSync(p, 'utf8');
const codeYamlErrors = [];
const yamlOr = (p, fallback) => { try { return parseYaml(read(p)) || fallback; } catch (e) { codeYamlErrors.push(`${rel(p)}: ${e.message}`); return fallback; } };
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);
const dirs = (d) => ls(d).filter((n) => statSync(join(d, n)).isDirectory());
const walk = (d, acc = []) => { for (const n of ls(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p, acc) : acc.push(p); } return acc; };

// Locate the docroot (composer may not have been run, so core/ may be absent)
// and the config sync directory.
const composerWebRoot = (() => { try { const c = JSON.parse(readFileSync(join(repo, 'composer.json'), 'utf8')); return c.extra?.['drupal-scaffold']?.locations?.['web-root']?.replace(/\/$/, ''); } catch { return null; } })();
const docroot = [composerWebRoot, 'web', 'docroot', 'html', 'public', '.'].filter(Boolean).map((d) => join(repo, d)).find((d) => existsSync(join(d, 'sites', 'default')) || existsSync(join(d, 'modules', 'custom')) || existsSync(join(d, 'core', 'lib', 'Drupal.php')));
if (!docroot) { console.error('no Drupal docroot found (looked for sites/default, modules/custom or core/ under the composer web-root, web, docroot, html, public, .)'); process.exit(1); }
// Core modules, for classifying core.extension when core/ is not checked out.
const CORE_MODULES = new Set('action announcements_feed automated_cron ban basic_auth big_pipe block block_content book breakpoint ckeditor5 color comment config config_translation contact content_moderation content_translation contextual datetime datetime_range dblog dynamic_page_cache editor field field_layout field_ui file filter forum help history image inline_form_errors jsonapi language layout_builder layout_discovery link locale media media_library menu_link_content menu_ui migrate migrate_drupal migrate_drupal_ui mysql navigation node options page_cache path path_alias pgsql phpass responsive_image rest search serialization settings_tray shortcut sqlite standard statistics syslog system taxonomy telephone text toolbar tour tracker update user views views_ui workflows workspaces minimal demo_umami'.split(' '));
const CORE_THEMES = new Set(['claro', 'olivero', 'stark', 'stable', 'stable9', 'starterkit_theme', 'umami', 'seven', 'bartik', 'classy']);
const syncDir = ['config/sync', 'config/default', 'config', `${rel(docroot)}/sites/default/config/sync`].map((d) => join(repo, d)).find((d) => existsSync(join(d, 'core.extension.yml')));
if (!syncDir) { console.error('no config export found (core.extension.yml)'); process.exit(1); }

const config = {}; const parseErrors = [];
for (const f of ls(syncDir).filter((n) => n.endsWith('.yml')).sort()) {
  try { config[f.slice(0, -4)] = parseYaml(read(join(syncDir, f))); } catch (e) { parseErrors.push(`${f}: ${e.message}`); }
}
const cfgPath = (id) => rel(join(syncDir, id + '.yml'));
const byPrefix = (p) => Object.keys(config).filter((k) => k.startsWith(p + '.')).sort();
const facts = { repo, docroot: rel(docroot), syncDir: rel(syncDir), configCount: Object.keys(config).length, parseErrors };

// ---- site, modules, themes -------------------------------------------------
const ext = config['core.extension'] || { module: {}, theme: {} };
const customModulesDir = join(docroot, 'modules', 'custom');
const customThemesDir = join(docroot, 'themes', 'custom');
const moduleKind = (m) => existsSync(join(customModulesDir, m)) || existsSync(join(docroot, 'profiles', 'custom', m)) ? 'custom' : existsSync(join(docroot, 'core', 'modules', m)) || CORE_MODULES.has(m) ? 'core' : 'contrib';
const modules = Object.keys(ext.module || {}).map((m) => ({ name: m, kind: moduleKind(m) }));
const site = config['system.site'] || {};
facts.site = { name: site.name, slogan: site.slogan, frontPage: site.page?.front, profile: ext.profile, defaultTheme: config['system.theme']?.default, adminTheme: config['system.theme']?.admin,
  languages: byPrefix('language.entity').map((k) => k.split('.').pop()), defaultLangcode: config['system.site']?.default_langcode };
facts.modules = { core: modules.filter((m) => m.kind === 'core').map((m) => m.name), contrib: modules.filter((m) => m.kind === 'contrib').map((m) => m.name), custom: modules.filter((m) => m.kind === 'custom').map((m) => m.name) };
facts.themes = Object.keys(ext.theme || {}).map((t) => ({ name: t, custom: existsSync(join(customThemesDir, t)), core: CORE_THEMES.has(t) || existsSync(join(docroot, 'core', 'themes', t)) }));

// ---- content model ------------------------------------------------------------
const storages = {}; for (const k of byPrefix('field.storage')) { const c = config[k]; storages[`${c.entity_type}.${c.field_name}`] = c; }
const bundleTypes = [
  ['node', 'node.type', (c) => c.type, (c) => c.name],
  ['taxonomy_term', 'taxonomy.vocabulary', (c) => c.vid, (c) => c.name],
  ['media', 'media.type', (c) => c.id, (c) => c.label],
  ['paragraph', 'paragraphs.paragraphs_type', (c) => c.id, (c) => c.label],
  ['block_content', 'block_content.type', (c) => c.id, (c) => c.label],
];
facts.bundles = [];
for (const [entityType, prefix, idOf, labelOf] of bundleTypes) {
  for (const k of byPrefix(prefix)) {
    const c = config[k]; const bundle = idOf(c);
    const fields = byPrefix(`field.field.${entityType}.${bundle}`).map((fk) => {
      const f = config[fk]; const s = storages[`${entityType}.${f.field_name}`] || {};
      const targetType = s.settings?.target_type; const tb = f.settings?.handler_settings?.target_bundles;
      return { name: f.field_name, label: f.label, type: s.type || f.field_type, required: !!f.required, cardinality: s.cardinality, targetType, targetBundles: tb ? Object.keys(tb) : (targetType ? ['*'] : []), config: cfgPath(fk) };
    });
    const formDisplay = config[`core.entity_form_display.${entityType}.${bundle}.default`];
    const viewModes = byPrefix(`core.entity_view_display.${entityType}.${bundle}`).map((v) => v.split('.').pop());
    facts.bundles.push({ entityType, bundle, label: labelOf(c), description: c.description || '', config: cfgPath(k), fields, hiddenInForm: formDisplay?.hidden ? Object.keys(formDisplay.hidden) : [], viewModes, workflow: null });
  }
}
// users have fields too
facts.userFields = byPrefix('field.field.user.user').map((fk) => { const f = config[fk]; const s = storages[`user.${f.field_name}`] || {}; return { name: f.field_name, label: f.label, type: s.type || f.field_type, required: !!f.required, config: cfgPath(fk) }; });
for (const wk of byPrefix('workflows.workflow')) { const w = config[wk]; const bundles = w.type_settings?.entity_types || {}; for (const [et, bs] of Object.entries(bundles)) for (const b of arr(bs)) { const x = facts.bundles.find((y) => y.entityType === et && y.bundle === b); if (x) x.workflow = { id: w.id, states: Object.keys(w.type_settings?.states || {}), config: cfgPath(wk) }; } }

// ---- roles and permissions -----------------------------------------------------
const nodeBundles = facts.bundles.filter((b) => b.entityType === 'node').map((b) => b.bundle);
const vocabs = facts.bundles.filter((b) => b.entityType === 'taxonomy_term').map((b) => b.bundle);
facts.roles = byPrefix('user.role').map((k) => {
  const r = config[k]; const perms = arr(r.permissions);
  const has = (p) => perms.includes(p);
  const all = r.is_admin || has('bypass node access');
  const content = {};
  for (const b of nodeBundles) {
    const ops = { create: all || has(`create ${b} content`), editOwn: all || has(`edit own ${b} content`), editAny: all || has(`edit any ${b} content`), deleteOwn: all || has(`delete own ${b} content`), deleteAny: all || has(`delete any ${b} content`), revisions: all || has(`view ${b} revisions`) || has('view all revisions') };
    if (Object.values(ops).some(Boolean)) content[b] = ops;
  }
  const terms = {}; for (const v of vocabs) { const ops = { create: r.is_admin || has(`create terms in ${v}`), edit: r.is_admin || has(`edit terms in ${v}`), delete: r.is_admin || has(`delete terms in ${v}`) }; if (Object.values(ops).some(Boolean)) terms[v] = ops; }
  const groups = { administer: [], access: [], view: [], api: [], fields: [], flags: [], formats: [], other: [] };
  for (const p of perms) {
    if (/^(create|edit|delete) (own |any )?\S+ content$/.test(p) || /^view \S+ revisions$/.test(p) || /^(create|edit|delete) terms in /.test(p)) continue;
    if (/^administer /.test(p)) groups.administer.push(p);
    else if (/^restful |jsonapi|^rest /.test(p)) groups.api.push(p);
    else if (/^(view|edit|create) (own |anyone's )?field_/.test(p)) groups.fields.push(p);
    else if (/^(flag|unflag) /.test(p)) groups.flags.push(p);
    else if (/^use text format /.test(p)) groups.formats.push(p);
    else if (/^access /.test(p)) groups.access.push(p);
    else if (/^view /.test(p)) groups.view.push(p);
    else groups.other.push(p);
  }
  return { id: r.id, label: r.label, isAdmin: !!r.is_admin, permissionCount: perms.length, config: cfgPath(k), content, terms, groups };
});

// ---- views ---------------------------------------------------------------------
facts.views = byPrefix('views.view').map((k) => {
  const v = config[k]; const d = v.display || {}; const def = d.default?.display_options || {};
  const typeFilter = def.filters?.type?.value ? Object.keys(def.filters.type.value) : [];
  const displays = Object.entries(d).filter(([id]) => id !== 'default').map(([id, x]) => { const o = x.display_options || {}; const acc = o.access || def.access || {};
    return { id, plugin: x.display_plugin, title: x.display_title, path: o.path || null, access: acc.type ? `${acc.type}${acc.options?.role ? ':' + Object.keys(acc.options.role).join('|') : ''}${acc.options?.perm ? ':' + acc.options.perm : ''}` : null, menu: o.menu?.type && o.menu.type !== 'none' ? o.menu.title : null, enabled: x.display_options?.enabled !== false };
  });
  return { id: v.id, label: v.label, description: v.description || '', status: v.status, baseTable: v.base_table, bundles: typeFilter, displays, config: cfgPath(k) };
});

// ---- blocks, menus, actions, other config --------------------------------------
facts.blocks = byPrefix('block.block').map((k) => { const b = config[k]; return { id: b.id, theme: b.theme, region: b.region, plugin: b.plugin, roles: b.visibility?.user_role?.roles ? Object.keys(b.visibility.user_role.roles) : [], paths: b.visibility?.request_path?.pages || null, config: cfgPath(k) }; });
facts.menus = byPrefix('system.menu').map((k) => ({ id: config[k].id, label: config[k].label, config: cfgPath(k) }));
facts.actions = byPrefix('system.action').map((k) => ({ id: config[k].id, label: config[k].label, plugin: config[k].plugin, config: cfgPath(k) }));
const covered = /^(field\.(field|storage)|node\.type|taxonomy\.vocabulary|media\.type|paragraphs\.paragraphs_type|block_content\.type|core\.entity_(form|view)_(display|mode)|core\.base_field_override|core\.date_format|user\.role|views\.view|block\.block|system\.menu|system\.action|workflows\.workflow|core\.extension|language\.entity)\./;
const other = {}; for (const k of Object.keys(config)) { if (covered.test(k + '.') || covered.test(k)) continue; const parts = k.split('.'); const type = parts.length > 2 ? parts.slice(0, 2).join('.') : parts[0]; (other[type] ||= []).push(k); }
facts.otherConfig = Object.fromEntries(Object.entries(other).sort().map(([t, ids]) => [t, ids.sort()]));

// ---- custom code -----------------------------------------------------------------
const phpId = (src) => (/\bid\s*=\s*"([^"]+)"/.exec(src) || /\bid:\s*'([^']+)'/.exec(src) || /\bid:\s*"([^"]+)"/.exec(src) || [])[1] || null;
const phpClass = (src) => (/^(?:final |abstract )?class\s+(\w+)/m.exec(src) || [])[1] || null;
function codeFacts(dir, name) {
  const info = existsSync(join(dir, `${name}.info.yml`)) ? yamlOr(join(dir, `${name}.info.yml`), {}) : {};
  const routingFile = join(dir, `${name}.routing.yml`);
  const routes = existsSync(routingFile) ? Object.entries(yamlOr(routingFile, {})).map(([rn, r]) => ({ name: rn, path: r.path, handler: r.defaults?._controller || r.defaults?._form || r.defaults?._entity_form || r.defaults?._entity_list || null, title: r.defaults?._title || null, requirements: Object.entries(r.requirements || {}).map(([a, b]) => `${a}: ${b}`).join(', '), file: rel(routingFile) })) : [];
  const servicesFile = join(dir, `${name}.services.yml`);
  const services = existsSync(servicesFile) ? Object.entries(yamlOr(servicesFile, {}).services || {}).map(([sid, s]) => ({ id: sid, class: s?.class || (s?.parent ? `parent ${s.parent}` : s?.factory ? `factory ${Array.isArray(s.factory) ? s.factory.join('::') : s.factory}` : null), tags: arr(s?.tags).map((t) => t?.name).filter(Boolean), file: rel(servicesFile) })) : [];
  const moduleFile = join(dir, `${name}.module`);
  const hooks = existsSync(moduleFile) ? [...read(moduleFile).matchAll(new RegExp(`^function ${name}_(\\w+)\\(`, 'gm'))].map((m) => m[1]) : [];
  const permsFile = join(dir, `${name}.permissions.yml`);
  const permissions = existsSync(permsFile) ? Object.keys(yamlOr(permsFile, {})) : [];
  const links = ['menu', 'task', 'action', 'contextual'].flatMap((t) => { const f = join(dir, `${name}.links.${t}.yml`); return existsSync(f) ? Object.keys(yamlOr(f, {})).map((l) => `${t}: ${l}`) : []; });
  const libraries = existsSync(join(dir, `${name}.libraries.yml`)) ? Object.keys(yamlOr(join(dir, `${name}.libraries.yml`), {})) : [];
  const src = join(dir, 'src');
  const php = walk(src).filter((p) => p.endsWith('.php'));
  const plugins = php.filter((p) => p.includes('/Plugin/')).map((p) => { const s = read(p); const type = relative(join(src, 'Plugin'), p).split('/').slice(0, -1).join('/'); return { type, class: phpClass(s), id: phpId(s), file: rel(p) }; });
  const pluginTypes = ls(join(src, 'Annotation')).filter((n) => n.endsWith('.php')).map((n) => n.slice(0, -4)).concat(ls(join(src, 'Attribute')).filter((n) => n.endsWith('.php')).map((n) => n.slice(0, -4)));
  const subscribers = php.filter((p) => p.includes('/EventSubscriber/')).map((p) => { const s = read(p); const events = [...s.matchAll(/(\w+Events::\w+|KernelEvents::\w+)/g)].map((m) => m[1]); return { class: phpClass(s), events: [...new Set(events)], file: rel(p) }; });
  const commands = php.filter((p) => /\/(Command|Commands|Drush)/.test(p)).map((p) => { const s = read(p); const names = [...s.matchAll(/#\[(?:CLI\\)?Command\(\s*name:\s*'([^']+)'/g)].map((m) => m[1]).concat([...s.matchAll(/@command\s+(\S+)/g)].map((m) => m[1])); return { class: phpClass(s), commands: names, file: rel(p) }; });
  const controllers = php.filter((p) => p.includes('/Controller/')).map((p) => ({ class: phpClass(read(p)), file: rel(p) }));
  const forms = php.filter((p) => p.includes('/Form/')).map((p) => ({ class: phpClass(read(p)), file: rel(p) }));
  const entities = php.filter((p) => p.includes('/Entity/')).map((p) => { const s = read(p); return { class: phpClass(s), id: phpId(s), kind: /ContentEntityType/.test(s) ? 'content' : /ConfigEntityType/.test(s) ? 'config' : 'other', file: rel(p) }; });
  const templates = walk(join(dir, 'templates')).filter((p) => p.endsWith('.twig')).map(rel);
  const tests = walk(join(dir, 'tests')).filter((p) => p.endsWith('.php')).length;
  const configInstall = ls(join(dir, 'config', 'install')).length; const schema = ls(join(dir, 'config', 'schema')).length;
  return { name, path: rel(dir), label: info.name, description: info.description, package: info.package, dependencies: arr(info.dependencies).map(String), routes, services, hooks, permissions, links, libraries, plugins, pluginTypes, subscribers, commands, controllers, forms, entities, templates, tests, configInstall, schema };
}
facts.customModules = dirs(customModulesDir).map((n) => codeFacts(join(customModulesDir, n), n));
facts.customThemes = dirs(customThemesDir).map((n) => { const dir = join(customThemesDir, n); const info = existsSync(join(dir, `${n}.info.yml`)) ? yamlOr(join(dir, `${n}.info.yml`), {}) : {};
  return { name: n, path: rel(dir), label: info.name, base: info['base theme'], regions: Object.keys(info.regions || {}), templates: walk(join(dir, 'templates')).filter((p) => p.endsWith('.twig')).length, libraries: Object.keys(existsSync(join(dir, `${n}.libraries.yml`)) ? yamlOr(join(dir, `${n}.libraries.yml`), {}) : {}) }; });

// ---- settings, hosting, tooling -----------------------------------------------------
const settingsFiles = ls(join(docroot, 'sites', 'default')).filter((n) => /^settings.*\.php$/.test(n)).map((n) => join(docroot, 'sites', 'default', n));
facts.settings = settingsFiles.map((p) => { const s = read(p); return { file: rel(p), envVars: [...new Set([...s.matchAll(/getenv\(\s*['"]([A-Z0-9_]+)['"]/g)].map((m) => m[1]).concat([...s.matchAll(/\$_(?:ENV|SERVER)\[['"]([A-Z0-9_]+)['"]\]/g)].map((m) => m[1])))], configOverrides: [...new Set([...s.matchAll(/\$config\[['"]([^'"]+)['"]\]/g)].map((m) => m[1]))], includes: [...s.matchAll(/(?:include|require)(?:_once)?\s*[^;]*['"]([^'"]+)['"]/g)].map((m) => m[1]) }; });
const has = (p) => existsSync(join(repo, p));
facts.hosting = { platformsh: has('.platform.app.yaml') || has('.platform'), ddev: has('.ddev/config.yaml') ? (() => { const c = yamlOr(join(repo, '.ddev/config.yaml'), {}); return { type: c.type, php: c.php_version, db: c.database?.type ? `${c.database.type} ${c.database.version || ''}`.trim() : null, webserver: c.webserver_type }; })() : null,
  lando: has('.lando.yml'), docker: ls(repo).filter((n) => /^(docker-compose|compose).*\.ya?ml$/.test(n) || n === 'Dockerfile'), githubWorkflows: ls(join(repo, '.github', 'workflows')), gitlabCi: has('.gitlab-ci.yml'), drushDir: ls(join(repo, 'drush')), composerDrupalPackages: (() => { try { const c = JSON.parse(read(join(repo, 'composer.json'))); return Object.keys(c.require || {}).filter((k) => k.startsWith('drupal/')).length; } catch { return null; } })(),
  qa: ['phpcs.xml', 'phpcs.xml.dist', 'phpstan.neon', 'phpstan.neon.dist', 'phpmd.xml', 'grumphp.yml', 'phpunit.xml', 'phpunit.xml.dist', 'behat.yml', 'playwright.config.ts', 'cypress.config.js'].filter(has) };
facts.cron = { automatedCron: facts.modules.core.includes('automated_cron'), ultimateCron: facts.modules.contrib.includes('ultimate_cron'), customHookCron: facts.customModules.filter((m) => m.hooks.includes('cron')).map((m) => m.name), queueWorkers: facts.customModules.flatMap((m) => m.plugins.filter((p) => p.type === 'QueueWorker').map((p) => `${m.name}: ${p.id || p.class}`)) };

// ---- output --------------------------------------------------------------------------
facts.codeYamlErrors = codeYamlErrors;
writeFileSync(join(out, 'drupal-facts.json'), JSON.stringify(facts, null, 2));
const yes = (b) => (b ? 'yes' : '');
const L = [];
L.push(`# Drupal facts: ${facts.site.name || basename(repo)}`, '', `Extracted from the config export at \`${facts.syncDir}\` (${facts.configCount} files) and the code under \`${rel(customModulesDir)}\`. Deterministic; cite config files as \`path:1\`. Config parse errors: ${parseErrors.length}${parseErrors.length ? ' (' + parseErrors.join('; ') + ')' : ''}. Code YAML skipped: ${codeYamlErrors.length}${codeYamlErrors.length ? ' (' + codeYamlErrors.join('; ') + ')' : ''}.`, '');
L.push('## Site', '', `- Name: ${facts.site.name}; front page: ${facts.site.frontPage}; profile: ${facts.site.profile || 'none recorded'}; languages: ${facts.site.languages.join(', ')} (default ${facts.site.defaultLangcode}). ${cfgPath('system.site')}:1`, `- Themes: default ${facts.site.defaultTheme}, admin ${facts.site.adminTheme}; custom themes: ${facts.themes.filter((t) => t.custom).map((t) => t.name).join(', ') || 'none'}. ${cfgPath('system.theme')}:1`, `- Modules enabled: ${facts.modules.core.length} core, ${facts.modules.contrib.length} contrib, ${facts.modules.custom.length} custom. ${cfgPath('core.extension')}:1`, `- Contrib: ${facts.modules.contrib.join(', ')}`, `- Custom: ${facts.modules.custom.join(', ')}`, '');
L.push('## Content model', '');
for (const b of facts.bundles) {
  L.push(`### ${b.entityType}: ${b.label} (\`${b.bundle}\`)`, '', `${b.description ? b.description.replace(/<[^>]+>/g, '') + ' ' : ''}Config: ${b.config}:1. View modes: ${b.viewModes.join(', ') || 'default'}.${b.workflow ? ` Workflow ${b.workflow.id} (${b.workflow.states.join(' → ')}), ${b.workflow.config}:1.` : ''}`, '');
  if (b.fields.length) { L.push('| Field | Label | Type | Required | Cardinality | Target | Config |', '|---|---|---|---|---|---|---|'); for (const f of b.fields) L.push(`| ${f.name} | ${f.label} | ${f.type} | ${yes(f.required)} | ${f.cardinality === -1 ? 'unlimited' : f.cardinality} | ${f.targetType ? f.targetType + (f.targetBundles.length ? ' (' + f.targetBundles.join(', ') + ')' : '') : ''} | ${f.config} |`); L.push(''); }
  if (b.hiddenInForm.length) L.push(`Hidden in the default form: ${b.hiddenInForm.join(', ')}.`, '');
}
if (facts.userFields.length) { L.push('### user fields', '', '| Field | Label | Type | Required | Config |', '|---|---|---|---|---|'); for (const f of facts.userFields) L.push(`| ${f.name} | ${f.label} | ${f.type} | ${yes(f.required)} | ${f.config} |`); L.push(''); }
L.push('## Roles and permissions', '', `Roles: ${facts.roles.map((r) => `${r.label} (\`${r.id}\`, ${r.isAdmin ? 'admin, ' : ''}${r.permissionCount} permissions)`).join('; ')}.`, '');
L.push('### Content operations per role', '', '| Role | Bundle | create | edit own | edit any | delete own | delete any | revisions |', '|---|---|---|---|---|---|---|---|');
for (const r of facts.roles) for (const [b, o] of Object.entries(r.content)) L.push(`| ${r.id} | ${b} | ${yes(o.create)} | ${yes(o.editOwn)} | ${yes(o.editAny)} | ${yes(o.deleteOwn)} | ${yes(o.deleteAny)} | ${yes(o.revisions)} |`);
L.push('', '### Taxonomy operations per role', '', '| Role | Vocabulary | create | edit | delete |', '|---|---|---|---|---|');
for (const r of facts.roles) for (const [v, o] of Object.entries(r.terms)) L.push(`| ${r.id} | ${v} | ${yes(o.create)} | ${yes(o.edit)} | ${yes(o.delete)} |`);
L.push('', '### Other permissions per role', '');
for (const r of facts.roles) { L.push(`- **${r.id}** (${r.config}:1)`); for (const [g, ps] of Object.entries(r.groups)) if (ps.length) L.push(`  - ${g}: ${ps.join('; ')}`); }
L.push('', '## Views', '', '| View | Label | Base | Bundles | Display | Plugin | Path | Access | Menu | Config |', '|---|---|---|---|---|---|---|---|---|---|');
for (const v of facts.views) { if (!v.displays.length) L.push(`| ${v.id} | ${v.label} | ${v.baseTable} | ${v.bundles.join(', ')} | (default only) | | | | | ${v.config} |`); for (const d of v.displays) L.push(`| ${v.id}${v.status ? '' : ' (disabled)'} | ${v.label} | ${v.baseTable} | ${v.bundles.join(', ')} | ${d.id} | ${d.plugin} | ${d.path || ''} | ${d.access || ''} | ${d.menu || ''} | ${v.config} |`); }
L.push('', '## Blocks, menus, actions', '', `- Block placements: ${facts.blocks.length}; by theme and region: ${Object.entries(facts.blocks.reduce((a, b) => { const k = `${b.theme}/${b.region}`; a[k] = (a[k] || 0) + 1; return a; }, {})).map(([k, n]) => `${k} ${n}`).join(', ')}.`, `- Custom block plugins placed: ${facts.blocks.filter((b) => facts.modules.custom.some((m) => b.plugin.startsWith(m))).map((b) => `${b.plugin} in ${b.theme}/${b.region} (${b.config}:1)`).join('; ') || 'none'}.`, `- Blocks with role visibility: ${facts.blocks.filter((b) => b.roles.length).map((b) => `${b.id} → ${b.roles.join('|')}`).join('; ') || 'none'}.`, `- Menus: ${facts.menus.map((m) => `${m.id} (${m.label})`).join(', ')}.`, `- Actions: ${facts.actions.map((a) => `${a.id} [${a.plugin}]`).join(', ')}.`, '');
L.push('## Other configuration present', '');
for (const [t, ids] of Object.entries(facts.otherConfig)) L.push(`- ${t} (${ids.length}): ${ids.map((i) => i.replace(t + '.', '')).join(', ')}`);
L.push('', '## Custom modules', '');
for (const m of facts.customModules) {
  L.push(`### ${m.name}: ${m.label || ''}`, '', `${m.description || ''} Path: ${m.path}. Dependencies: ${m.dependencies.join(', ') || 'none'}. Tests: ${m.tests} files. Config install: ${m.configInstall}, schema: ${m.schema}.`, '');
  if (m.hooks.length) L.push(`- Hooks in ${m.name}.module: ${m.hooks.join(', ')}`);
  if (m.routes.length) { L.push(`- Routes (${m.routes[0].file}):`); for (const r of m.routes) L.push(`  - ${r.name}: ${r.path} → ${r.handler}${r.requirements ? ` [${r.requirements}]` : ''}`); }
  if (m.services.length) { L.push(`- Services (${m.services[0].file}):`); for (const s of m.services) L.push(`  - ${s.id}: ${s.class}${s.tags.length ? ` (tags: ${s.tags.join(', ')})` : ''}`); }
  if (m.pluginTypes.length) L.push(`- Defines plugin types: ${m.pluginTypes.join(', ')}`);
  if (m.plugins.length) { L.push('- Plugins:'); for (const p of m.plugins) L.push(`  - ${p.type}: ${p.id || '?'} (${p.class}) ${p.file}`); }
  if (m.subscribers.length) for (const s of m.subscribers) L.push(`- Event subscriber ${s.class}: ${s.events.join(', ') || 'events not detected'} (${s.file})`);
  if (m.commands.length) for (const c of m.commands) L.push(`- Drush commands in ${c.class}: ${c.commands.join(', ') || 'names not detected'} (${c.file})`);
  if (m.controllers.length) L.push(`- Controllers: ${m.controllers.map((c) => `${c.class} (${c.file})`).join(', ')}`);
  if (m.forms.length) L.push(`- Forms: ${m.forms.map((c) => `${c.class} (${c.file})`).join(', ')}`);
  if (m.entities.length) L.push(`- Entity types: ${m.entities.map((e) => `${e.id || e.class} [${e.kind}] (${e.file})`).join(', ')}`);
  if (m.permissions.length) L.push(`- Defines permissions: ${m.permissions.join('; ')}`);
  if (m.links.length) L.push(`- Links: ${m.links.join('; ')}`);
  if (m.libraries.length) L.push(`- Libraries: ${m.libraries.join(', ')}`);
  if (m.templates.length) L.push(`- Templates: ${m.templates.join(', ')}`);
  L.push('');
}
if (facts.customThemes.length) { L.push('## Custom themes', ''); for (const t of facts.customThemes) L.push(`- ${t.name} (${t.label}): base ${t.base || 'none'}; regions ${t.regions.join(', ')}; ${t.templates} templates; libraries ${t.libraries.join(', ') || 'none'}. ${t.path}`); L.push(''); }
L.push('## Cron and queues', '', `- automated_cron: ${yes(facts.cron.automatedCron) || 'no'}; ultimate_cron: ${yes(facts.cron.ultimateCron) || 'no'}; custom hook_cron: ${facts.cron.customHookCron.join(', ') || 'none'}; custom queue workers: ${facts.cron.queueWorkers.join(', ') || 'none'}.`, '');
L.push('## Settings, hosting, tooling', '');
for (const s of facts.settings) L.push(`- ${s.file}: env vars ${s.envVars.join(', ') || 'none'}; config overrides ${s.configOverrides.join(', ') || 'none'}; includes ${s.includes.join(', ') || 'none'}`);
L.push(`- Hosting signals: platform.sh ${yes(facts.hosting.platformsh) || 'no'}; ddev ${facts.hosting.ddev ? `${facts.hosting.ddev.type} php ${facts.hosting.ddev.php} ${facts.hosting.ddev.db || ''} ${facts.hosting.ddev.webserver || ''}` : 'no'}; lando ${yes(facts.hosting.lando) || 'no'}; docker files ${facts.hosting.docker.join(', ') || 'none'}; GitHub workflows ${facts.hosting.githubWorkflows.join(', ') || 'none'}; GitLab CI ${yes(facts.hosting.gitlabCi) || 'no'}; drush/ ${facts.hosting.drushDir.join(', ') || 'none'}; drupal/* composer packages ${facts.hosting.composerDrupalPackages}; QA config ${facts.hosting.qa.join(', ') || 'none'}.`, '');
writeFileSync(join(out, 'drupal-facts.md'), L.join('\n'));

// ---- content model scene ---------------------------------------------------------------
const RESERVED = new Set(['label', 'shape', 'style', 'class', 'link', 'icon', 'width', 'height', 'constraint', 'near', 'tooltip', 'direction', 'top', 'left', 'vars', 'classes', 'layers', 'scenarios', 'steps', 'source-arrowhead', 'target-arrowhead']);
const col = (n) => (RESERVED.has(n) ? n + '_' : n);
const D = ['direction: right', '# Generated by extract-drupal.mjs; edit freely. Entities are sql_table shapes, edges are entity references.'];
const sceneBundles = facts.bundles.filter((b) => b.entityType !== 'block_content');
const idOf = (b) => `${b.entityType}_${b.bundle}`;
const refTargets = new Set();
for (const b of sceneBundles) {
  D.push(`${idOf(b)}: "${b.label} (${b.entityType}.${b.bundle})" { class: entity`); // sql_table labels cannot contain newlines
  for (const f of b.fields) D.push(`  ${col(f.name)}: "${f.type}${f.cardinality === -1 ? ' (multi)' : ''}"`);
  D.push('}');
}
for (const b of sceneBundles) for (const f of b.fields) if (f.targetType) {
  const targets = f.targetType === 'user' ? ['user'] : f.targetBundles.includes('*') ? [f.targetType] : f.targetBundles.map((tb) => `${f.targetType}_${tb}`);
  for (const t of targets) { if (!sceneBundles.some((x) => idOf(x) === t)) refTargets.add(t); D.push(`${idOf(b)}.${col(f.name)} -> ${t}: "${f.label}" { class: edge }`); }
}
for (const t of refTargets) D.push(`${t}: "${t}" { class: entity }`);
writeFileSync(join(out, 'drupal-content-model.d2'), D.join('\n') + '\n');
console.error(`wrote ${join(out, 'drupal-facts.md')}, drupal-facts.json, drupal-content-model.d2 (${facts.bundles.length} bundles, ${facts.roles.length} roles, ${facts.views.length} views, ${facts.customModules.length} custom modules${parseErrors.length ? `, ${parseErrors.length} parse errors` : ''})`);

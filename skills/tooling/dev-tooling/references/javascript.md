# JavaScript and TypeScript layer

Applies to each directory with a `package.json`. Treat every manifest directory on its own: a Drupal theme, a Playwright suite and a root workspace each get their own entries, installed with that directory's package manager. Workspace members install through the root.

The direction for this layer: TypeScript 7 with its native compiler and language server, oxlint instead of ESLint, and Fallow for codebase health.

## TypeScript 7

- **Tier:** always for a new TypeScript project; ask when upgrading an existing one below 7.
- **Applies when:** the package has `typescript` as a dependency or a `tsconfig.json`. A package with TypeScript files but neither, such as a Playwright suite that transpiles its own specs, gets no TypeScript row; oxlint and Fallow still apply.
- **Minimum version:** 7. An existing 5.x or 6.x is outdated, and the upgrade is an ask.
- **Scope:** project dependency.
- **Present when:** `typescript` resolves to 7.x (the detect script prints declared and installed versions).
- **Install:** `<pm> add -D typescript@^7`. The `@typescript/native-preview` package and its `tsgo` binary were the preview route; replace them with `typescript@^7`, which ships `tsc`.
- **Upgrade blockers.** Check these before proposing an upgrade, and name the ones that apply:
  - Vue, Svelte, Astro, MDX and Angular editor tooling are not supported on 7 yet. The detect script prints these frameworks per package.
  - Tools that import the `typescript` API directly, such as typescript-eslint and gulp-typescript, still need 6.x. The official workaround is an alias: `"typescript": "npm:@typescript/typescript6@^6.0.2"` alongside `"@typescript/native": "npm:typescript@^7.0.2"`.
  - `tsconfig` options deprecated in 6.0 or removed in 7.0 must be migrated first. Common ones are `baseUrl` and `moduleResolution: "node"` (node10).
- **Language server:** `tsc --lsp --stdio` (verified against 7.0.2). Editors pick this up themselves; for the agent, see `agent.md`.
- **Verify:** `npx tsc --version` prints 7.x, and `npx tsc --noEmit` runs. Report the error count; fixing type errors is out of scope.

## oxlint

- **Tier:** always when the package has no linter; ask when ESLint is present.
- **Scope:** project dependency and config.
- **Present when:** `oxlint` is a dev dependency, or `.oxlintrc.json` or `oxlint.config.ts` exists.
- **Install:** `<pm> add -D oxlint`, then `npx oxlint --init` to generate `.oxlintrc.json`. For TypeScript on 7.x, also `<pm> add -D oxlint-tsgolint` and turn on type-aware rules in the root config:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import"],
  "categories": { "correctness": "error", "suspicious": "warn" },
  "options": { "typeAware": true }
}
```

  `options.typeAware` works only in the root config, and requires TypeScript 7. On TypeScript below 7, leave it out.
- **ESLint present:** do not remove ESLint or its config. Report oxlint as a replacement candidate and ask. If the user agrees to run both during a migration, add `eslint-plugin-oxlint` to the ESLint config so the rules oxlint covers are turned off there. In a Drupal project, ignore the ESLint files Drupal scaffolds into the webroot; see `drupal.md`.
- **Wire-up:** `"lint": "oxlint"` script, unless a `lint` script already exists; then add `"lint:ox"` and tell the user.
- **Verify:** `npx oxlint` runs and exits. Report the counts.

## Fallow

Codebase intelligence for TypeScript and JavaScript: unused files, exports and dependencies, duplication, complexity hotspots, circular dependencies, architecture boundaries and styling drift. Zero config for over 100 frameworks. Ships a CLI, an LSP server (`fallow-lsp`) and an MCP server (`fallow-mcp`).

- **Tier:** always
- **Scope:** project dependency and config; MCP registration is in `agent.md`.
- **Present when:** `fallow` is a dev dependency, or `.fallowrc.json`, `.fallowrc.jsonc`, `fallow.toml` or `.fallow.toml` exists.
- **Install:** `<pm> add -D fallow`, then `npx fallow init` to write `.fallowrc.json`. Fallow works with no config, so only add `entry` or `ignorePatterns` when the first run shows false positives such as generated files or worker entry points.
- **Wire-up:** `"health": "fallow"` script.
- **Verify:** `npx fallow` runs. Rule severity decides the exit code: `error` exits 1, `warn` exits 0, and an unknown config key exits 2. Report the summary; do not fix findings.
- **Do not run** `fallow agent install` or `fallow hooks install`. They write agent configuration for every harness they detect; register the MCP server explicitly as `agent.md` describes.

## oxfmt

The oxc formatter, the counterpart to oxlint. Still 0.x.

- **Tier:** ask, only when the package has no formatter. When Prettier or Biome is configured, skip the row entirely.
- **Install:** `<pm> add -D oxfmt`. Check `npx oxfmt --help` for its init and config options before writing a config; they are moving between releases.

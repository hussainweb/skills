# CSS layer

Applies when the project has stylesheets (`.css`, `.scss`, `.sass`, `.less`, `.pcss`). The detect script groups stylesheets by the package that owns them. Stylesheets with no owning package, such as a module's single CSS file, are still measurable with Wallace but cannot take a linter install. Do not create a `package.json` for them.

Project Wallace is the direction for CSS, used mainly by the agent while it writes CSS rather than as a check in CI.

## Wallace (agent-side)

Project Wallace's analyzer measures a stylesheet: distinct colors, font sizes and other token values, specificity, selector complexity, `!important` use, size. The `wallace` skill in this repository runs it before and after a CSS change and steers the CSS by the numbers.

- **Tier:** always
- **Scope:** agent. Nothing is installed in the project: the skill runs `npx -y wallace-cli@4`.
- **Present when:** the `wallace` skill is available to the agent. Check the agent's skill list; if it is missing, install it with `npx skills add hussainweb/skills@wallace`.
- **Setup per project:** none required. Record in the report which stylesheet the agent should measure, usually the built bundle (`dist/`, `build/`, a theme's `css/`), and the command that builds it, so future sessions find it without searching. If the project has an `AGENTS.md`, propose adding that one line there.
- **Verify:** pipe the built CSS into `npx -y wallace-cli@4 --json` and confirm it prints JSON. Report the three most over-budget metrics from the skill's summary script as a first look, without changing any CSS.

Stylelint is not part of the default stack. If a project uses it anyway, note that it does not overlap with oxlint, which lints only JavaScript and TypeScript. The one real overlap is Biome, which also lints CSS.

Do not install `constyble`, Project Wallace's old standalone checker: it has not been released since 2022.

## Stylelint with the Project Wallace plugin (optional CI gate)

For projects that want CSS limits to block a build. Most projects do not need it: the agent-side loop above is where Wallace earns its keep.

- **Tier:** ask. Offer it when the project has CI, or already runs Stylelint, and the user wants CSS budgets enforced rather than advised. In a package that already runs Stylelint 16 or newer, adding the preset is cheap; say so.
- **Scope:** project dependency and config.
- **Present when:** `@projectwallace/stylelint-plugin` is a dev dependency and the Stylelint config extends or loads it. Stylelint alone counts as partial.
- **Minimum version:** Stylelint 16; the plugin supports 16 and 17. A project on Stylelint 15 or older is outdated, and upgrading it is an ask, because its other Stylelint plugins usually need upgrading too.
- **Install:** `<pm> add -D stylelint @projectwallace/stylelint-plugin`. For SCSS sources, also add `postcss-scss` and set `customSyntax`.
- **Config:** if a Stylelint config exists, add the preset to its `extends` and keep everything else. Otherwise write `stylelint.config.mjs`:

```js
export default {
  extends: [
    '@projectwallace/stylelint-plugin/configs/maintainability',
    '@projectwallace/stylelint-plugin/configs/correctness',
    '@projectwallace/stylelint-plugin/configs/design-tokens',
  ],
};
```

  The presets are `recommended` (everything), `holistic`, `design-tokens`, `performance`, `maintainability` and `correctness`. Use the three above on source files. The `holistic` and `performance` rules count and compare across a whole stylesheet, so they only mean something on the shipped bundle. When the project builds CSS, add a second script that lints the built output with `recommended`.
- **Wire-up:** when a build tool such as gulp already runs Stylelint, adding the preset to the config is enough; add no script. Otherwise add `"lint:css": "stylelint --max-warnings 0 \"**/*.{css,scss}\""`, scoped to the source directory, plus `"lint:css:dist"` against the build output when there is one.
- **Failing the build:** the Wallace presets report warnings, and Stylelint exits 0 on warnings, so a check built on the presets alone never fails CI. Run it with `--max-warnings 0` in every script and CI step (verified with Stylelint 17.16 and plugin 0.7.1). Set `defaultSeverity: "error"` in the config instead only when the project wants every rule to block.
- **Verify:** the script runs. Report the counts, and name the three rules with the most hits so the user can decide which limits to tune.

## Fallow styling drift

In a JavaScript or TypeScript project with Fallow installed, `npx fallow health --css` (or `fallow audit`) reports drift from the design system. Mention it in the report; there is nothing extra to install.

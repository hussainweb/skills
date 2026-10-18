# Writing CSS that moves the numbers

How to write CSS so the metrics in `metrics.md` move in the right direction. The techniques are grouped by the metric they affect. Read the two rules first; they decide which techniques are allowed in a given project.

## Two rules before any technique

**Match the project's system.** Before writing CSS, find out how the project already does it: utility classes, CSS Modules, scoped component styles, a naming convention such as BEM, plain global stylesheets, or a mix. Find where its tokens live and how files are organised. Write new CSS the same way. Mixing approaches causes more drift over time than any single approach does, so never introduce a second methodology, naming scheme or token system. If the existing system is the problem, say so and propose a change; do not start one quietly.

**Check the browser targets.** Several techniques below are recent additions to CSS. Look for the project's targets in `browserslist` in `package.json`, a `.browserslistrc` file, or the project's documentation. Use a feature only when every target supports it, or behind `@supports` with a fallback that still works. When no targets are recorded, prefer the widely supported option and mention the newer one as an option.

## Tokens before new UI

When the task is new UI in a project with no tokens for colour, type, spacing and shadows, propose a small token set first and get agreement. Generating screens before the tokens exist is how a stylesheet ends up with dozens of near-identical values that later need consolidating.

## Fewer distinct token values

- **Reuse before adding.** Run `--values` for the category first. An existing token or value is the default; a new one needs a reason.
- **Tokens live in one place**, usually custom properties on `:root` or the project's token file, and are overridden in narrower scopes where a theme or section needs it.
- **Derive variants from a token instead of hard-coding them.** A lighter border or a darker shadow can come from the base colour with relative colour syntax (`oklch(from var(--brand) calc(l + 0.1) c h)`) or `color-mix()`. Changing the base colour then updates every variant. Wallace still counts each derived expression as its own colour, so the distinct-colour count does not drop. What drops is the number of times the hard-coded base colour appears, and the derived entries in `--values colors` show which token they come from. Verified with wallace-cli 4.0.4.
- **Typed custom properties.** `@property` registers a custom property with a syntax, an initial value and an `inherits` flag. Use `inherits: false` for values that should not leak into nested components, such as a layout gap. A registered type also lets a custom property animate.

## Less repetition (declaration uniqueness, declarations per rule)

- **Let inheritance work.** `font-family`, `font-size`, `line-height`, `letter-spacing` and `color` inherit. Set them on the base elements and on a component's root, not again on every child. Generated CSS often restates them on each element, which inflates declaration counts and the number of distinct font sizes and line heights, and makes a type change touch dozens of rules.

- **Build variants by changing variables, not properties.** A component reads its colours and sizes from component-level custom properties, such as `--button-bg`. A variant then sets only those properties, and every declaration that reads them follows. Redeclaring `background`, `border-color` and `box-shadow` in each variant is the repetition this removes.
- **Per-instance overrides** can set a component's custom property inline or from a parent, without a new modifier class.
- **Shared patterns go in a shared place.** Tables, headings, form controls and prose styles belong in base or shared component styles, not inside one page's component, where they get copied.

## Fewer media queries

- **Intrinsic layouts first.** Grid with `repeat(auto-fit, minmax(…, 1fr))`, flex wrapping and `min()`, `max()` and `clamp()` let a layout adapt without breakpoints.
- **Fluid type and spacing.** A type scale built on `clamp()` grows smoothly between a minimum and a maximum. Use one shared scale, not a `clamp()` per element, or the font-size count rises instead of falling.
- **Container queries for components.** A component placed in a sidebar and in a main column should respond to its container, not to the viewport.
- **Change variables inside a query, not rules.** At a breakpoint, set two or three custom properties instead of re-declaring every affected rule.

## Lower specificity and less `!important`

- **Cascade layers.** Declare the order once, for example `@layer reset, base, components, utilities, overrides;`, and put each stylesheet in its layer. A later layer wins regardless of specificity, so overrides stop needing heavier selectors. Unlayered styles beat every layer, and `!important` reverses layer order, so keep both rare.
- **`:where()` for zero specificity.** Base and library styles wrapped in `:where()` can be overridden by a single class.
- **One class per element.** Give an element its own class rather than reaching it through IDs or chained selectors. Never repeat a selector to win a specificity contest.
- **`!important` is a symptom.** Each one marks an override the cascade could not express. Fix the layer or the base selector instead. Utility classes and user-preference overrides such as `prefers-reduced-motion` are the accepted exceptions.
- **Resetting values.** `unset`, `initial` and `revert` behave differently, and `revert-layer` rolls back to the previous layer. Pick the one that means what you intend, and do not use them to fight specificity.

## Lower selector complexity

- **`@scope` instead of descendant chains.** Rules inside `@scope (.card)` apply only within a card, so `.title` is enough where `.card .title` was needed. Wallace scores the inner selector alone, so complexity drops; verified with wallace-cli 4.0.4. A limit, `@scope (.card) to (.card)`, stops the styles at a nested card: a "donut" scope.
- **Shallow nesting.** Native nesting is convenient, but every level adds to the compiled selector. Keep it to one or two levels, mostly for states and pseudo-elements.

## Fewer spacing resets

- **Space where it is needed.** `gap` on flex and grid containers, or a single rule that spaces siblings, replaces margins added everywhere and then reset on the first or last child.
- **Resets with care.** A base reset is fine, but stripping every default leaves content from editors and CMSs, such as nested lists, tables and quotes, unstyled. Restore sensible defaults for prose content in one place.

## Restraint with decorative styles

Gradients, layered shadows, glows and elaborate animations are where generated CSS drifts most, and they date quickly. Use them only where the design calls for them, from the project's tokens: a few shadow levels, a few gradients, a motion scale. The gradient, shadow and duration counts show when this has slipped.

## Structure that keeps CSS maintainable

These do not map to a single metric, but they decide whether the numbers stay good.

- **Self-contained components.** A component should look the same when dropped onto an empty page. Styles that only work in one location depend on their surroundings and break when moved.
- **Base elements look right without classes.** Plain headings, links, lists, tables and form controls should already match the design. Components then add little, and content from editors needs no extra classes.
- **No one-off values in components.** A value used once in one component is usually a missing token or a deliberate exception. Name the token, or leave a comment saying why it is an exception.

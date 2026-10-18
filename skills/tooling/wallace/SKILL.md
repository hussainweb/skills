---
name: wallace
description: Measure CSS with Project Wallace's analyzer (wallace-cli) and use the numbers to steer how CSS is written — toward fewer distinct colors, font sizes and other design-token values, lower specificity, simpler selectors and less `!important`. Use this skill whenever the agent writes, refactors or reviews CSS or SCSS, works on a theme or component styles, consolidates design tokens, or the user asks "clean up the CSS", "why is our CSS so big", "audit the stylesheet", "how consistent is our design system", "too many font sizes", "specificity problems", or mentions Wallace or Project Wallace. Measures before and after a change so improvements and regressions are shown in numbers. Not a CI gate; for blocking builds on CSS limits, the dev-tooling skill has an optional Stylelint setup.
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
metadata:
  authors: "Hussain Abbas"
  version: "0.1.0"
---

# Wallace

Project Wallace's analyzer turns a stylesheet into numbers: how many distinct colors, font sizes and shadows it uses, how specific and complex its selectors are, how much `!important` it leans on. wallace-cli prints those numbers and nothing else. This skill is the judgement layer: read the numbers, decide which direction the CSS should move, write CSS that moves it, and measure again.

The point is better CSS while it is being written, not a pass or fail. A change that adds a fourteenth font size or a new ID selector should be caught by the agent that wrote it, in the same session.

## Running it

Always pipe the CSS in, and always run it with an explicit version:

```sh
npx -y wallace-cli@4 --json < path/to/styles.css > "$SCRATCH/wallace-before.json"
```

Two traps make every other form unreliable for an agent (verified in wallace-cli 4.0.4):

- **It reads standard input whenever that is not a terminal**, even when given a file path, and even for `--help` and `--version`. In an agent's shell it waits forever unless input is piped or redirected. To learn the version, run `npm view wallace-cli@4 version` instead.
- **It joins a file argument to the working directory**, so an absolute path fails with `ENOENT`.

Write the JSON to a scratch directory, never into the repository. One run is around 200 KB of JSON. Do not read it directly; use the summary script.

```sh
python3 <skill>/scripts/summary.py after.json [before.json]
python3 <skill>/scripts/summary.py after.json --values font-sizes
```

The first form prints the curated metrics with Project Wallace's reference limits and, given a baseline, the change in each. The second lists the distinct values in one category with how often each is used. The categories are `colors`, `color-formats`, `font-families`, `font-sizes`, `line-heights`, `z-indexes`, `box-shadows`, `border-radiuses`, `gradients`, `durations`, `timing-functions`, `units`, `resets`, `media`, `ids`, `custom-unused`, `custom-unknown` and `keyframes-unused`. The output carries counts only, never file locations; search the source to find where a value lives.

The "better" and "WORSE" labels only mean something when both files cover the same CSS, compiled the same way, before and after a change. Comparing a full bundle with its authored subset, or Vite output with Sass output, produces differences that are not regressions. The script warns when the sizes differ enough to suggest that.

## What to measure

Wallace measures CSS as the browser receives it, so measure CSS, not SCSS.

- **Built output first.** Look for the project's compiled CSS (`dist/`, `build/`, `.next/static/css/`, a theme's `css/` directory). If it is stale or missing, run the project's build, through DDEV when the project uses it.
- **Include per-component CSS.** Drupal single-directory components, and component libraries generally, ship a CSS file per component next to the global bundle, loaded per page. For distinct-value counts, concatenate the global bundle with every component file. Order does not change the counts, so alphabetical is fine; say that real load order varies by page.
- **SCSS without a build:** compile with the same load paths the build uses (read them from the Vite, webpack or gulp config), suppress the error stylesheet, and check the exit code:

```sh
npx -y sass --no-error-css --load-path=src/scss path/to/file.scss > "$SCRATCH/file.css" || echo "compile failed"
```

  Without `--no-error-css`, a failed compile writes a small stylesheet containing the error, and the analyzer measures that as if it were the site. Never feed SCSS to the analyzer directly; Sass variables, mixins and functions are not CSS and skew every count.
- **One compiler per comparison.** Minifiers such as Vite's lightningcss normalise colours and media queries, so the same source measures differently built and Sass-compiled. Both sides of a before and after comparison must come from the same tool. When one side has to be compiled by hand, compile the other side the same way.
- **Separate what the project controls from what it ships.** Bundles often include vendor CSS: WordPress block styles in a Drupal theme, normalize, an icon font, a component library. Its values inflate every count and none of it is the project's to change. Find it by reading the entry stylesheet's imports and searching for vendor directories or names; `--values custom-unused` and `--values colors` can hint at prefixes such as `--wp-`, but cannot say where values come from. To measure the authored part, write a scratch copy of the entry without the vendor imports, compile it as above, and compile the full entry the same way for the comparison. Never edit the project's entry file for this.

## The loop

1. **Baseline before editing.** Measure the CSS the change will touch, and keep the JSON. For component work, measure the component's own compiled CSS as well as the full bundle.
2. **Pick the metrics the task touches.** A new component touches token counts, specificity and selector complexity. A refactor touches size, duplication and `!important`. Read the summary, then `references/metrics.md` for the rows that matter.
3. **Look at the existing values before adding any.** Run `--values` for each token category the change needs, such as `font-sizes` before setting a size and `colors` before choosing a color. Reuse an existing value or custom property; a new distinct value needs a reason.
4. **Write the CSS** the way the project already writes it, using the techniques in `references/writing.md` for the metrics you picked.
5. **Measure again and compare** against the baseline. Every metric that got worse is either fixed or explained in the report.
6. **Report in numbers.** The metrics that moved, before and after, and any regression with its reason. Never claim CSS is cleaner, leaner or more consistent without the numbers that show it.

## Audits

For an audit with no change attached, measure the full shipped CSS and the authored CSS, then compare against the project's own design system as well as against Wallace's references.

1. **Find the declared tokens**: SCSS variables and maps, a tokens file, custom properties on `:root`, a Tailwind theme. Count each scale: palette colours, font sizes, spacing, shadows, z-indexes, breakpoints, durations.
2. **Compare usage against the declared scales.** A theme with a 24-colour palette that uses 79 colours is inconsistent, even though 79 is under Wallace's 128. This comparison, not the generic limit, answers "is the design system consistent". Also count raw literals in the source next to token references for each category.
3. **Run `--values`** for every category that is over the declared scale or over the reference.
4. **Report** in this order:
   - A one-line verdict.
   - What was measured, including the vendor and authored split, with its share of size and of each token count.
   - A table of authored token counts against both the declared scale and the reference.
   - Selector and declaration findings.
   - The consolidation proposal: per category, the target scale and a mapping from current values to steps. List the values that need a human decision separately.
   - The caveats: load order, compiler, and unused findings verified or not.
5. **Do not apply** the consolidation until the user agrees, since it changes how the site looks.

## Judgement rules

- **Match the project's system.** Write new CSS the way the project already writes it, in its methodology, naming and token system, and use newer CSS features only where its browser targets allow. `references/writing.md` covers both rules.
- **Deltas matter more than absolutes.** The reference limits are Project Wallace's budgets for a whole shipped stylesheet. A component never needs to be under them; it needs to not make the totals worse without a reason.
- **Do not game the counts.** Wrapping a one-off value in a one-off custom property changes nothing that matters. Consolidating means fewer distinct values in the design, not the same values moved around.
- **"Unused" is a lead, not a verdict.** Custom properties, keyframes and classes that look unused in one stylesheet may be used by another stylesheet, by JavaScript, by templates or by a CMS. Search the codebase before removing anything, and say what you searched.
- **Visual changes need consent.** Merging `15px` into `16px` or two greys into one changes the rendered page. Within the task's own new code, use the existing scale freely. Changing existing values is a proposal for the user to accept.
- **Vendor CSS is out of scope.** Report its weight if it dominates the numbers, and suggest loading it separately or dropping unused parts. Never hand-edit vendor files.

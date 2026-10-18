# Reading the numbers

What each metric in `scripts/summary.py` measures, which direction is better, and the short version of how to move it. `writing.md` has the techniques in full. Reference limits come from Project Wallace's `recommended` Stylelint preset (plugin 0.7.1) and apply to a whole shipped stylesheet.

## Size

| Metric | Reference | Better | Meaning, and how to move it |
|---|---|---|---|
| bytes | 200,000 | lower | The stylesheet's size before compression. Remove dead rules, split rarely used CSS into separately loaded files, and keep vendor CSS out of the main bundle. |
| source lines | 10,000 | lower | Lines after formatting. Same levers as bytes. |
| embedded content bytes | 10,000 | lower | `data:` URIs inlined in the CSS, usually SVG icons. They cannot be cached separately and repeat on every page. Move large or repeated ones to files or an icon sprite. |
| rules, selectors, declarations | 1,000 / 2,500 / 5,000 | lower | Overall volume. Growth with no new feature behind it means duplication. |
| empty rules | 0 | lower | Rules with no declarations. Delete them. |

## Selectors

| Metric | Reference | Better | Meaning, and how to move it |
|---|---|---|---|
| complexity, mean and max | 3 / 15 | lower | Complexity counts the parts of a selector: each type, class, ID, attribute or pseudo-class adds one, and so does each combinator. So `.card .title` is 3 and `nav ul > li a:hover` is 8. Complex selectors couple CSS to markup structure and break when the markup changes. Give the element its own class instead of describing its path. |
| specificity, max (a,b,c) | 0,5,0 | lower | `a` counts IDs, `b` classes, attributes and pseudo-classes, `c` elements. Any `a` above 0 beats every class selector, which starts specificity wars. Replace ID selectors with classes. Wrap selectors in `:where()` to give them zero specificity, and use `@layer` to order groups of rules instead of out-specifying them. |
| specificity, mean | 0.02,2.5,1 | lower | The typical selector. A rising mean means overrides are being won by adding selectors. Fix the cascade order rather than adding weight. |
| ID selectors | none | lower | Each one is a specificity spike. `--values ids` lists them. Some come from vendor CSS or CMS markup and are out of reach. |
| selectors per rule, mean and max | 3 / 10 | lower | Long selector lists are usually copy-paste accumulation. A shared class or a component class shrinks them. |
| nesting depth, max | 3 | lower | Native CSS nesting depth. Deep nesting produces long, specific selectors. Flatten it. |
| selector uniqueness ratio | min 0.66 | higher | The share of selectors that appear only once. Low means the same selector is declared in several places; merge those blocks. |

## Declarations

| Metric | Reference | Better | Meaning, and how to move it |
|---|---|---|---|
| declarations per rule, mean and max | 6 / 15 | lower | Very large rules do too many jobs. Split by concern, or move shared declarations into a shared class. |
| !important ratio and count | 0.1 | lower | The share of declarations marked `!important`. Each one is an override that the cascade could not express. `@layer` and lower base specificity remove the need. Legitimate exceptions are utility classes and `prefers-reduced-motion` overrides. The JSON only counts them, so search the source for `!important` to find them. |
| declaration uniqueness ratio | min 0.5 | higher | The share of property and value pairs that appear only once. Low means the same declarations are repeated across rules; a shared class or custom property removes the repetition. |
| spacing resets | 16 | lower | Declarations that set `margin` or `padding` to zero. Many resets mean spacing is added in one place and removed in another. Add spacing where it is needed, for example with `gap` or a stack utility, instead of resetting it. `--values resets` shows which properties. |

## Design tokens

Each of these counts distinct values as written, so formatting variants count separately: `0.75rem` and `.75rem`, `#fff` and `white`, three spellings of transparent, and colour keywords such as `currentcolor`. Raw counts therefore overstate the number of design decisions; read `--values` before quoting a number as "distinct sizes" or "distinct colours". Fewer distinct values means a more consistent design that is easier to change. Before adding a value, run `--values` for its category and reuse what exists. To consolidate, define the scale as custom properties and map each existing value to its nearest step. Near-duplicates are the usual target: `16px` and `1rem`, `#333` and `#323232`, `0.2s` and `200ms`.

| Metric | Reference | Note |
|---|---|---|
| colors | 128 | Check `--values colors` for near-identical shades. Variants derived with relative colour syntax or `color-mix()` each still count as a colour; see `writing.md`. |
| color formats | 4 | Hex, `rgb()`, `hsl()`, `oklch()` and named colors mixed together. Pick one format for authored CSS. |
| font families | 4 | Each family is usually a font download as well. |
| font sizes | 16 | The type scale. Mixed `px`, `rem` and `em` for the same size count separately. |
| line heights | 12 | Prefer unitless values tied to the type scale. |
| z-indexes | 8 | Define layers as named custom properties instead of escalating numbers. |
| box shadows, text shadows | 8 / 4 | Elevation levels belong in tokens. |
| border radiuses | none | Usually two to four steps. |
| gradients | 8 | Often one-offs that should be tokens or images. |
| animation durations, timing functions | 8 / 4 | A motion scale of a few durations and easings. |
| units | 10 | Many units for one job, such as `px`, `rem` and `em` for spacing, mean no shared scale. |
| media queries | 12 | Distinct media query strings, not breakpoints: `(max-width: 959px)`, `only screen and (max-width: 959px)` and `print` all count separately. Read `--values media` to find the underlying widths. Many near-identical widths (781px, 782px, 768px) mean no shared breakpoint set. Prefer a few breakpoints, or container queries for components. |
| keyframes | 8 | Distinct animations. |

## Custom properties

| Metric | Better | Meaning |
|---|---|---|
| defined, used | n/a | How much of the CSS runs on custom properties. A design system shows many uses per definition. |
| defined but never used | lower | Candidates for removal, but only after searching other stylesheets, JavaScript and templates. Measuring one file alone makes everything defined for other files look unused. |
| used but never defined | lower | `var()` references with no definition in this CSS. These are usually defined elsewhere, in another file, inline in markup or by JavaScript. Occasionally they are typos that silently fall back. Check each one. |
| unused keyframes | lower | `@keyframes` with no `animation` referencing them. The same search caveat applies. |

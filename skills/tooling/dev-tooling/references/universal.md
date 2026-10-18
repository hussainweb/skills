# Universal layer

Applies to every project, whatever the stack.

## jscpd

Copy-paste detection across 224 languages, so it covers PHP, Twig, CSS and Python as well as JavaScript. Version 5 has a Rust engine, respects `.gitignore` by default and can fail CI over a duplication threshold.

- **Tier:** always
- **Scope:** project dependency when the project has a root `package.json`; config file only otherwise.
- **Present when:** `jscpd` is in a `package.json`, or `.jscpd.json` exists.
- **Install:** `<pm> add -D jscpd` in the root package. In a project with no root `package.json` (a PHP or Python project, a Drupal site whose only `package.json` is in a theme), do not create one just for this. Write the config and run it as `npx jscpd@5`.
- **Config:** `.jscpd.json` at the root.

```json
{
  "threshold": 5,
  "minTokens": 50,
  "ignore": ["**/*.min.js", "**/*.min.css", "**/dist/**", "**/build/**"],
  "reporters": ["console"]
}
```

  Add stack-specific ignores the layer files name, such as Drupal core and contrib directories when they are not gitignored. Do not set `format`; leaving it out scans every supported language.
- **Wire-up:** with a root `package.json`, a `"dupes": "jscpd ."` script. Without one, a `"dupes"` Composer script running `npx jscpd@5 .` when there is a `composer.json`, else nothing. If GrumPHP or CI already runs checks, propose adding it there instead.
- **Verify:** `npx jscpd .` exits 0, or reports a duplication percentage above the threshold. Report the percentage. Do not lower the threshold to make it pass; tell the user the number and let them choose.
- **Overlap:** in a JavaScript or TypeScript project, Fallow also reports duplication. Keep both: jscpd sees the non-JavaScript files Fallow does not read.

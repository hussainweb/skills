#!/usr/bin/env python3
"""Summarise wallace-cli JSON so an agent never has to read the raw output.

  summary.py AFTER.json [BEFORE.json]      curated metrics, reference limits, deltas
  summary.py AFTER.json --values NAME      distinct values with counts, most used first

Reference limits are the defaults of Project Wallace's own `recommended`
Stylelint preset (@projectwallace/stylelint-plugin 0.7.1). They are budgets for
a whole shipped stylesheet, not for a single component.
"""
import json
import sys

# (label, json path, reference limit or None, direction) ; direction "down" or "up"
METRICS = [
    ("Size", [
        ("bytes", "stylesheet.size", 200_000, "down"),
        ("source lines", "stylesheet.sourceLinesOfCode", 10_000, "down"),
        ("embedded content bytes", "stylesheet.embeddedContent.size.total", 10_000, "down"),
        ("rules", "rules.total", 1_000, "down"),
        ("selectors", "selectors.total", 2_500, "down"),
        ("declarations", "declarations.total", 5_000, "down"),
        ("empty rules", "rules.empty.total", 0, "down"),
    ]),
    ("Selectors", [
        ("complexity, mean", "selectors.complexity.mean", 3, "down"),
        ("complexity, max", "selectors.complexity.max", 15, "down"),
        ("specificity, max (a,b,c)", "selectors.specificity.max", (0, 5, 0), "down"),
        ("specificity, mean (a,b,c)", "selectors.specificity.mean", (0.02, 2.5, 1), "down"),
        ("ID selectors", "selectors.id.total", None, "down"),
        ("selectors per rule, mean", "rules.selectors.mean", 3, "down"),
        ("selectors per rule, max", "rules.selectors.max", 10, "down"),
        ("nesting depth, max", "rules.nesting.max", 3, "down"),
        ("selector uniqueness ratio", "selectors.uniquenessRatio", 0.66, "up"),
    ]),
    ("Declarations", [
        ("declarations per rule, mean", "rules.declarations.mean", 6, "down"),
        ("declarations per rule, max", "rules.declarations.max", 15, "down"),
        ("!important ratio", "declarations.importants.ratio", 0.1, "down"),
        ("!important count", "declarations.importants.total", None, "down"),
        ("declaration uniqueness ratio", "declarations.uniquenessRatio", 0.5, "up"),
        ("spacing resets", "values.resets.total", 16, "down"),
    ]),
    ("Design tokens (distinct values)", [
        ("colors", "values.colors.totalUnique", 128, "down"),
        ("color formats", "values.colors.formats.totalUnique", 4, "down"),
        ("font families", "values.fontFamilies.totalUnique", 4, "down"),
        ("font sizes", "values.fontSizes.totalUnique", 16, "down"),
        ("line heights", "values.lineHeights.totalUnique", 12, "down"),
        ("z-indexes", "values.zindexes.totalUnique", 8, "down"),
        ("box shadows", "values.boxShadows.totalUnique", 8, "down"),
        ("text shadows", "values.textShadows.totalUnique", 4, "down"),
        ("border radiuses", "values.borderRadiuses.totalUnique", None, "down"),
        ("gradients", "values.gradients.totalUnique", 8, "down"),
        ("animation durations", "values.animations.durations.totalUnique", 8, "down"),
        ("timing functions", "values.animations.timingFunctions.totalUnique", 4, "down"),
        ("units", "values.units.totalUnique", 10, "down"),
        ("media queries", "atrules.media.totalUnique", 12, "down"),
        ("keyframes", "atrules.keyframes.totalUnique", 8, "down"),
    ]),
    ("Custom properties", [
        ("defined", "properties.custom.defined", None, None),
        ("used", "properties.custom.used", None, None),
        ("defined but never used", "properties.custom.unused", 0, "down"),
        ("used but never defined", "properties.custom.unknown", None, "down"),
        ("unused keyframes", "atrules.keyframes.unused", 0, "down"),
    ]),
]

# --values NAME -> path to a {value: count} map, or to a list
VALUE_SOURCES = {
    "colors": "values.colors.unique",
    "color-formats": "values.colors.formats.unique",
    "font-families": "values.fontFamilies.unique",
    "font-sizes": "values.fontSizes.unique",
    "line-heights": "values.lineHeights.unique",
    "z-indexes": "values.zindexes.unique",
    "box-shadows": "values.boxShadows.unique",
    "border-radiuses": "values.borderRadiuses.unique",
    "gradients": "values.gradients.unique",
    "durations": "values.animations.durations.unique",
    "animation-durations": "values.animations.durations.unique",
    "timing-functions": "values.animations.timingFunctions.unique",
    "units": "values.units.unique",
    "resets": "values.resets.unique",
    "media": "atrules.media.unique",
    "ids": "selectors.id.unique",
    "custom-unused": "properties.custom.unused",
    "custom-unknown": "properties.custom.unknown",
    "keyframes-unused": "atrules.keyframes.unused",
}


def get(data, path):
    node = data
    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    if isinstance(node, list) and (not node or not isinstance(node[0], (int, float))):
        return len(node)  # a list of names: report its length
    return node


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, (list, tuple)):
        return ",".join(fmt(x) for x in v)
    if isinstance(v, float):
        return f"{v:.3f}".rstrip("0").rstrip(".") if v < 100 else f"{v:,.0f}"
    if isinstance(v, int):
        return f"{v:,}"
    return str(v)


def over(value, limit, direction):
    if value is None or limit is None or direction is None:
        return False
    if isinstance(limit, tuple):
        return tuple(value) > limit  # specificity compares a, then b, then c
    return value < limit if direction == "up" else value > limit


def delta(after, before, direction):
    if after is None or before is None or isinstance(after, list):
        if isinstance(after, list) and before is not None and list(after) != list(before):
            return f"was {fmt(before)}"
        return ""
    d = after - before
    if d == 0:
        return ""
    better = (d < 0) if direction == "down" else (d > 0) if direction == "up" else None
    tag = "" if better is None else (" better" if better else " WORSE")
    sign = "+" if d > 0 else ""
    return f"{sign}{fmt(d)}{tag}"


def load(path):
    with open(path) as fh:
        return json.load(fh)


def summary(after, before):
    print(f"{'metric':<34}{"value":>20}{'reference':>14}  {'':<2}{'change' if before else ''}")
    for section, rows in METRICS:
        print(f"\n{section}")
        for label, path, limit, direction in rows:
            v = get(after, path)
            flag = "!" if over(v, limit, direction) else ""
            ref = "" if limit is None else (("min " if direction == "up" else "max ") + fmt(limit))
            ch = delta(v, get(before, path), direction) if before else ""
            print(f"  {label:<32}{fmt(v):>20} {ref:>15}  {flag:<2}{ch}")
    print("\n! = outside Project Wallace's recommended reference for a whole stylesheet.")
    if before:
        a, b = get(after, "stylesheet.size") or 0, get(before, "stylesheet.size") or 0
        if a and b and max(a, b) / min(a, b) > 1.5:
            print("note: the two stylesheets differ in size by more than 50%. If they do not cover the same CSS"
                  " compiled the same way, the better/WORSE labels describe scope, not quality.")
        if min(a, b) < 2_000:
            print("note: one stylesheet is under 2 KB. Check it is not a failed compile's error output.")


def values(data, name):
    path = VALUE_SOURCES.get(name)
    if not path:
        sys.exit(f"unknown --values name. Choose from: {', '.join(VALUE_SOURCES)}")
    node = data
    for part in path.split("."):
        node = node.get(part, {}) if isinstance(node, dict) else {}
    if isinstance(node, list):
        for item in node:
            print(item)
        return
    for value, count in sorted(node.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"{count:>6}  {value}")


def main(argv):
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        sys.exit(__doc__)
    after = load(argv[1])
    if len(argv) >= 4 and argv[2] == "--values":
        values(after, argv[3])
        return
    before = load(argv[2]) if len(argv) >= 3 else None
    summary(after, before)


if __name__ == "__main__":
    main(sys.argv)

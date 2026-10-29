#!/usr/bin/env python3
"""Print the facts dev-tooling needs about a project, as "key: value" lines.

Facts only: layers, packages and their package managers, catalog tools found in
manifests, lock files and installs (with versions), existing configs, how tools
are already orchestrated, gitignore rules that affect config file names, and
machine binaries. Installs nothing and changes nothing.

Usage: python3 detect.py [project-dir]
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
PRUNE = {"node_modules", "vendor", ".git", "dist", "build", ".ddev", ".serena"}

# Catalog packages whose presence and version matter.
JS_TOOLS = ["typescript", "@typescript/native-preview", "oxlint", "oxlint-tsgolint", "oxfmt",
            "eslint", "prettier", "@biomejs/biome", "fallow", "jscpd", "stylelint",
            "@projectwallace/stylelint-plugin", "typescript-eslint", "gulp-typescript",
            "@playwright/test", "storybook", "@storybook/addon-mcp", "@spotlightjs/spotlight",
            "vite-plus"]
JS_FRAMEWORKS = ["vue", "svelte", "astro", "@angular/core", "next", "react"]
PHP_TOOLS = ["drupal/core", "drupal/core-recommended", "drupal/core-dev", "drupal/coder",
             "phpstan/phpstan", "mglaman/phpstan-drupal", "phpstan/extension-installer",
             "larastan/larastan", "laravel/pint", "laravel/boost", "laravel/framework",
             "rector/rector", "squizlabs/php_codesniffer", "vincentlanglet/twig-cs-fixer",
             "friendsoftwig/twigcs", "phpro/grumphp", "phpro/grumphp-shim",
             "drupal/ai_best_practices"]


def out(key, value):
    if value not in (None, "", []):
        print(f"{key}: {value}")


def run(*cmd, cwd=ROOT, timeout=10):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 1, ""


def file_list():
    code, text = run("git", "ls-files", "--cached", "--others", "--exclude-standard")
    if code == 0:
        return [f for f in text.splitlines() if f and (ROOT / f).exists()]
    files = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in PRUNE]
        rel = Path(dirpath).relative_to(ROOT)
        files += [str(rel / f) if str(rel) != "." else f for f in filenames]
    return files


def load_json(path):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return {}


FILES = file_list()
IN_GIT = run("git", "rev-parse", "--is-inside-work-tree")[0] == 0


def matching(pattern, limit=None):
    rx = re.compile(pattern)
    hits = [f for f in FILES if rx.search(f) and not re.search(r"(^|/)(node_modules|vendor)/", f)]
    return hits[:limit] if limit else hits


layers = ["universal"]
print(f"root: {ROOT}")

# --- Drupal webroot (needed to flag scaffolded files) ---------------------------
composer = load_json(ROOT / "composer.json")
webroot = None
if composer:
    loc = composer.get("extra", {}).get("drupal-scaffold", {}).get("locations", {}).get("web-root")
    if loc:
        webroot = loc.strip("/").removeprefix("./") or "."
    else:
        for d in ("web", "docroot", "html"):
            if (ROOT / d / "core").is_dir() or (ROOT / d / "index.php").exists():
                webroot = d
                break

# --- JavaScript / TypeScript, per manifest directory ------------------------------
root_pkg = load_json(ROOT / "package.json")
workspace_root = (ROOT / "pnpm-workspace.yaml").exists() or "workspaces" in root_pkg


def pm_for(d):
    p = ROOT / d
    for lock, pm in (("pnpm-lock.yaml", "pnpm"), ("yarn.lock", "yarn"), ("bun.lock", "bun"),
                     ("bun.lockb", "bun"), ("package-lock.json", "npm")):
        if (p / lock).exists():
            return pm
    pkg = load_json(p / "package.json")
    if str(pkg.get("packageManager", "")).startswith("pnpm"):
        return "pnpm"
    if d != "." and workspace_root:
        return "workspace member of ."
    return "npm (no lockfile)"


def installed_version(d, name):
    v = load_json(ROOT / d / "node_modules" / name / "package.json").get("version")
    if not v and (ROOT / "node_modules" / name).exists():
        v = load_json(ROOT / "node_modules" / name / "package.json").get("version")
    return v


manifests = sorted(matching(r"(^|/)package\.json$", 25), key=lambda m: (m != "package.json", m))
ts_any = False
for m in manifests:
    d = str(Path(m).parent)
    pkg = load_json(ROOT / m)
    deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
    has_nm = (ROOT / d / "node_modules").is_dir() or (d != "." and workspace_root and (ROOT / "node_modules").is_dir())
    ts_files = len([f for f in FILES if f.startswith("" if d == "." else d + "/") and re.search(r"\.(ts|tsx|mts|cts)$", f) and not f.endswith(".d.ts")])
    tsconfig = (ROOT / d / "tsconfig.json").exists()
    if "typescript" in deps or tsconfig:
        ts_any = True
    out(f"js[{d}]", f"pm={pm_for(d)} node_modules={'yes' if has_nm else 'no'} ts_files={ts_files} tsconfig={'yes' if tsconfig else 'no'}")
    fws = []
    for f in JS_FRAMEWORKS:
        if f in deps:
            iv = installed_version(d, f) if has_nm else None
            fws.append(f"{f}@{deps[f]}" + (f" (installed {iv})" if iv else ""))
    out(f"js[{d}].frameworks", ", ".join(fws))
    tools = []
    for t in JS_TOOLS:
        if t in deps:
            iv = installed_version(d, t) if has_nm else None
            tools.append(f"{t}@{deps[t]}" + (f" (installed {iv})" if iv else ""))
    sentry = sorted(k for k in deps if k.startswith("@sentry/"))
    if sentry:
        tools.append("sentry: " + " ".join(sentry))
    out(f"js[{d}].tools", ", ".join(tools))
    scripts = pkg.get("scripts", {})
    out(f"js[{d}].scripts", ", ".join(f"{k}=\"{v}\"" for k, v in scripts.items() if re.search(r"lint|format|check|dupes|health|test|build", k))[:600])
if manifests:
    layers.append("javascript")
    if ts_any:
        layers.append("typescript")

# --- CSS -------------------------------------------------------------------------
css = matching(r"\.(css|scss|sass|less|pcss)$")
if css:
    layers.append("css")
    groups = {}
    for f in css:
        # Group by nearest directory that has a package.json, else by first three path parts.
        p = Path(f).parent
        owner = None
        while True:
            if (ROOT / p / "package.json").exists():
                owner = str(p)
                break
            if str(p) in (".", ""):
                break
            p = p.parent
        key = owner if owner is not None else "/".join(f.split("/")[:3]) + " (no package.json)"
        groups[key] = groups.get(key, 0) + 1
    out("css.files", len(css))
    for k, v in sorted(groups.items(), key=lambda kv: -kv[1])[:8]:
        out(f"css.owner[{k}]", v)

# --- PHP and frameworks ---------------------------------------------------------------
if composer:
    layers.append("php")
    req = composer.get("require", {})
    req_dev = composer.get("require-dev", {})
    lock = load_json(ROOT / "composer.lock")
    locked = {p["name"]: p.get("version") for p in lock.get("packages", []) + lock.get("packages-dev", [])}
    out("php.constraint", req.get("php"))
    out("php.vendor_installed", "yes" if (ROOT / "vendor").is_dir() else "no")
    rows = []
    for t in PHP_TOOLS:
        where = "require" if t in req else "require-dev" if t in req_dev else "transitive" if t in locked else None
        if where:
            rows.append(f"{t} [{where}" + (f" {locked[t]}" if t in locked else "") + "]")
    out("php.tools", ", ".join(rows))
    plugins = composer.get("config", {}).get("allow-plugins", {})
    if isinstance(plugins, dict):
        out("php.allow_plugins", ", ".join(k for k, v in plugins.items() if v))
    out("php.scripts", ", ".join(composer.get("scripts", {}).keys()))
    is_drupal = any(k in req for k in ("drupal/core", "drupal/core-recommended")) or (webroot and (ROOT / webroot / "core").is_dir())
    if is_drupal:
        layers.append("drupal")
        out("drupal.webroot", webroot or "unknown")
        out("drupal.core", locked.get("drupal/core") or req.get("drupal/core-recommended") or req.get("drupal/core"))
        sync = matching(r"(^|/)core\.extension\.yml$", 1)
        out("drupal.config_sync", str(Path(sync[0]).parent) if sync else None)
    if (ROOT / "artisan").exists() and "laravel/framework" in req:
        layers.append("laravel")
        out("laravel.framework", locked.get("laravel/framework") or req.get("laravel/framework"))

# --- Python -------------------------------------------------------------------------------
if matching(r"(^|/)(pyproject\.toml|requirements[^/]*\.txt|setup\.py|uv\.lock)$"):
    layers.append("python")
    pm = "uv" if (ROOT / "uv.lock").exists() else "poetry" if (ROOT / "poetry.lock").exists() else "none-detected"
    out("python.package_manager", pm)
    py = (ROOT / "pyproject.toml").read_text() if (ROOT / "pyproject.toml").exists() else ""
    tools = [t for t in ("ruff", "ty", "mypy", "pyright", "black", "isort", "flake8", "pylint") if re.search(rf"(^|[\s\"'\[]){t}\b", py)]
    out("python.tools_mentioned", ", ".join(tools))
    out("python.requires", (re.search(r'requires-python\s*=\s*"([^"]+)"', py) or [None, None])[1])

# --- Go, per module ------------------------------------------------------------------
gomods = sorted(matching(r"(^|/)go\.mod$", 10), key=lambda m: (m != "go.mod", m))
if gomods or (ROOT / "go.work").exists():
    layers.append("go")
    out("go.work", "yes" if (ROOT / "go.work").exists() else None)
    for m in gomods:
        d = str(Path(m).parent)
        text = (ROOT / m).read_text(errors="replace")
        ver = re.search(r"^go\s+(\S+)", text, re.M)
        tc = re.search(r"^toolchain\s+(\S+)", text, re.M)
        out(f"go[{d}]", f"go={ver.group(1) if ver else '?'}" + (f" toolchain={tc.group(1)}" if tc else ""))
        tools = re.findall(r"^tool\s+([^\s(]\S*)", text, re.M)
        block = re.search(r"^tool\s*\((.*?)^\)", text, re.M | re.S)
        if block:
            tools += re.findall(r"^\s*(\S+)", block.group(1), re.M)
        out(f"go[{d}].tools", ", ".join(tools))
    out("go.templ_files", len(matching(r"\.templ$")))
    out("go.tools_go", ", ".join(matching(r"(^|/)tools\.go$", 4)))

out("layers", " ".join(layers))

# --- Environment ------------------------------------------------------------------------
ddev_cfg = ROOT / ".ddev" / "config.yaml"
if ddev_cfg.exists():
    m = re.search(r"^type:\s*(\S+)", ddev_cfg.read_text(), re.M)
    state = "unknown"
    if shutil.which("ddev"):
        code, text = run("ddev", "describe", "-j", timeout=20)
        s = re.search(r'"status"\s*:\s*"([^"]+)"', text)
        state = s.group(1) if s else ("stopped" if code else "unknown")
    out("environment.ddev", f"type={m.group(1) if m else '?'} status={state}")
if (ROOT / "docker-compose.yml").exists() or (ROOT / "compose.yaml").exists():
    out("environment.compose", "yes")
for f in (".tool-versions", "mise.toml", ".mise.toml", ".nvmrc", ".node-version"):
    if (ROOT / f).exists():
        out("environment.version_file", f)

# --- Existing tool configs ---------------------------------------------------------------
def scaffolded(path):
    return bool(webroot) and str(Path(path).parent) in (webroot, ".") and "drupal" in layers and Path(path).name.startswith(".")


CONFIGS = {
    "eslint": r"(^|/)(\.eslintrc(\.[a-z]+)?|eslint\.config\.[cm]?[jt]s)$",
    "oxlint": r"(^|/)(\.oxlintrc\.json|oxlint\.config\.ts)$",
    "oxfmt": r"(^|/)\.oxfmtrc\.jsonc?$",
    "prettier": r"(^|/)(\.prettierrc(\.[a-z]+)?|prettier\.config\.[cm]?js)$",
    "biome": r"(^|/)biome\.jsonc?$",
    "jscpd": r"(^|/)\.jscpd\.json$",
    "fallow": r"(^|/)(\.fallowrc\.jsonc?|\.?fallow\.toml)$",
    "stylelint": r"(^|/)(\.stylelintrc(\.[a-z]+)?|stylelint\.config\.[cm]?js)$",
    "phpstan": r"(^|/)phpstan\.neon(\.dist)?$",
    "phpcs": r"(^|/)\.?phpcs\.xml(\.dist)?$",
    "rector": r"(^|/)rector\.php$",
    "pint": r"(^|/)pint\.json$",
    "ruff": r"(^|/)\.?ruff\.toml$",
    "ty": r"(^|/)ty\.toml$",
    "golangci": r"(^|/)\.golangci\.(ya?ml|toml|json)$",
    "serena": r"(^|/)\.serena/project\.yml$",
    "mcp": r"(^|/)\.mcp\.json$",
}
# Agent guidance files, root only.
for f in ("AGENTS.md", "CLAUDE.md", "GEMINI.md", "ai_best_practices.yaml", "boost.json"):
    if (ROOT / f).exists():
        text = (ROOT / f).read_text(errors="replace")
        marks = [m for m, rx in (("ai-best-practices", r"ai-best-practices"), ("laravel-boost", r"<laravel-boost-guidelines>")) if re.search(rx, text)]
        out(f"agent.{f}", "yes" + (f" (managed: {', '.join(marks)})" if marks else ""))
for d in (".agents/skills", ".claude/skills", ".ai/rules", ".ai/guidelines"):
    if (ROOT / d).is_dir():
        out(f"agent.dir[{d}]", len([x for x in (ROOT / d).iterdir()]))
for name, rx in CONFIGS.items():
    hits = matching(rx, 6)
    own = [h for h in hits if not scaffolded(h)]
    scaf = [h for h in hits if scaffolded(h)]
    out(f"config.{name}", ", ".join(own))
    out(f"config.{name}.scaffolded", ", ".join(scaf))
# Vite+ bundles oxlint and oxfmt and configures them in vite.config.* under `lint` and `fmt`.
for f in sorted(matching(r"(^|/)vite\.config\.[cm]?[jt]s$"), key=lambda p: (p.count("/"), p))[:6]:
    text = (ROOT / f).read_text(errors="replace")
    if not re.search(r"""from\s+["']vite-plus["']""", text):
        continue
    blocks = [b for b in ("lint", "fmt", "test", "run", "staged") if re.search(rf"^\s*{b}\s*:", text, re.M)]
    aware = "yes" if re.search(r"typeAware\s*:\s*true", text) else "no"
    out(f"config.vite-plus[{f}]", f"blocks={' '.join(blocks)} typeAware={aware}")
for f in matching(r"(^|/)\.golangci\.(ya?ml|toml|json)$", 4):
    v = re.search(r"""^["']?version["']?\s*[:=]\s*["']?(\d)""", (ROOT / f).read_text(errors="replace"), re.M)
    out(f"config.golangci.version[{f}]", v.group(1) if v else "1 (no version key)")
py = (ROOT / "pyproject.toml").read_text() if (ROOT / "pyproject.toml").exists() else ""
for t in ("ruff", "ty", "mypy", "pyright"):
    if re.search(rf"^\[tool\.{t}", py, re.M):
        out(f"config.{t}", "pyproject.toml")

# --- How tools are already run ---------------------------------------------------------
ORCH = {
    "grumphp": r"(^|/)grumphp\.ya?ml(\.dist)?$",
    "husky": r"(^|/)\.husky/",
    "lefthook": r"(^|/)lefthook\.ya?ml$",
    "pre-commit": r"(^|/)\.pre-commit-config\.yaml$",
    "gulp": r"(^|/)gulpfile\.[cm]?[jt]s$",
    "githooks-dir": r"^\.githooks/",
    "makefile": r"^(GNU)?[Mm]akefile$",
    "github-actions": r"^\.github/workflows/",
    "gitlab-ci": r"^\.gitlab-ci\.yml$",
    "bitbucket": r"^bitbucket-pipelines\.yml$",
    "phpmd": r"(^|/)phpmd\.xml(\.dist)?$",
    "phpunit": r"(^|/)phpunit\.xml(\.dist)?$",
    "twigcs": r"(^|/)\.twig[-_]?cs.*$",
}
for name, rx in ORCH.items():
    out(f"orchestrator.{name}", ", ".join(matching(rx, 4)))
for f in ("mise.toml", ".mise.toml"):
    if not (ROOT / f).exists():
        continue
    mise = (ROOT / f).read_text(errors="replace")
    out(f"orchestrator.mise-tasks[{f}]", " ".join(re.findall(r"^\[tasks\.([\w:-]+)\]", mise, re.M))[:300])
    tools = re.search(r"^\[tools\]\s*$(.*?)(?=^\[|\Z)", mise, re.M | re.S)
    if tools:
        out(f"environment.mise-tools[{f}]", ", ".join(re.findall(r"""^\s*["']?([^"'=\s#]+)["']?\s*=""", tools.group(1), re.M))[:400])
if IN_GIT:
    out("orchestrator.git-hooks-path", run("git", "config", "core.hooksPath")[1])

# --- Gitignore rules that change where configs can live --------------------------------
if IN_GIT:
    candidates = ["phpstan.neon.dist", "phpcs.xml.dist", ".jscpd.json", ".fallowrc.json",
                  ".oxlintrc.json", "stylelint.config.mjs", ".mcp.json", ".serena/project.yml", ".golangci.yml"]
    if webroot and webroot != ".":
        candidates += [f"{webroot}/core/x", f"{webroot}/modules/contrib/x", f"{webroot}/sites/default/files/x"]
    ignored = [c.removesuffix("/x") for c in candidates
               if run("git", "check-ignore", "-q", "--no-index", c)[0] == 0]
    out("gitignore.ignores", ", ".join(ignored))

# --- Machine ----------------------------------------------------------------------------
for b in ("node", "npm", "pnpm", "composer", "php", "uv", "serena", "claude", "go",
          "laravel-lsp", "intelephense", "phpactor", "ddev", "semble", "gopls", "golangci-lint", "mise"):
    out(f"bin.{b}", "yes" if shutil.which(b) else "no")
if shutil.which("serena"):
    out("bin.serena.version", run("serena", "--version")[1].removeprefix("Serena ").strip())
if shutil.which("golangci-lint"):
    v = re.search(r"version\s+v?(\S+)", run("golangci-lint", "version")[1])
    out("bin.golangci-lint.version", v.group(1) if v else None)

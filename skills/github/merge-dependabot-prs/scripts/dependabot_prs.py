#!/usr/bin/env python3
"""Inventory open Dependabot PRs and classify each one by semver bump and check status.

Read-only: this script never merges, closes, or comments on anything. It exists so the
fiddly parts — pulling the right JSON out of `gh`, reading Dependabot's commit-trailer
metadata, comparing versions, and collapsing a check rollup into one word — happen the
same way every time instead of being re-derived per PR.

Commit metadata is fetched per PR rather than in the list query. `gh pr list --json commits`
expands to a GraphQL query asking for authors(first: 100) on commits(first: 100) of every
PR, which GitHub rejects outright above ~48 PRs ("requesting up to 1,000,000 possible nodes
which exceeds the maximum limit of 500,000") no matter how many PRs actually exist. One
`gh pr view` per Dependabot PR stays far under that ceiling.

Usage:
    python3 dependabot_prs.py [--repo OWNER/REPO] [--limit N] [--author LOGIN] [--json]

Output (default): one table row per PR, plus a summary of what the default policy
(minor/patch + all checks green) would merge. With --json: the same data as a JSON
array on stdout, for scripting.

Exit codes: 0 = ran fine (even if zero PRs), 1 = gh call failed or gh is missing.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

# Worst-first. "unknown" outranks "major" because an unverifiable bump is the one case
# where we genuinely cannot promise the change is safe, so it must never slip through a
# "minor only" filter.
SEVERITY = ["unknown", "major", "minor", "patch", "none"]

# `commits` is deliberately absent: gh expands it to authors(first: 100) on
# commits(first: 100) per PR, which trips GitHub's 500,000-node query ceiling for any
# --limit above ~48. It is fetched one PR at a time instead, in fetch_commits().
BASE_FIELDS = [
    "number",
    "title",
    "body",
    "url",
    "headRefName",
    "isDraft",
    "mergeable",
    "statusCheckRollup",
    "labels",
]

# How many `gh pr view` calls to keep in flight. Small enough to stay polite to the API,
# large enough that a few dozen PRs resolve in seconds rather than a minute.
COMMIT_WORKERS = 6

# mergeStateStatus needs the `repo` scope; tokens without it make the whole query fail,
# so it is requested separately and dropped if GitHub refuses.
OPTIONAL_FIELDS = ["mergeStateStatus"]

FAILING_CONCLUSIONS = {
    "FAILURE",
    "TIMED_OUT",
    "CANCELLED",
    "ACTION_REQUIRED",
    "STARTUP_FAILURE",
    "STALE",
}
# NEUTRAL and SKIPPED are deliberately absent: GitHub treats both as non-blocking, and
# reporting them as failures would strand PRs that are actually fine to merge.
PASSING_CONCLUSIONS = {"SUCCESS", "NEUTRAL", "SKIPPED"}


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def run_gh(args: list[str]) -> subprocess.CompletedProcess:
    if not shutil.which("gh"):
        die("`gh` is not installed. Install the GitHub CLI: https://cli.github.com")
    return subprocess.run(["gh", *args], capture_output=True, text=True)


def fetch_prs(repo: str | None, author: str, limit: int) -> tuple[list[dict], bool]:
    """Return (prs, had_merge_state). Retries without mergeStateStatus on scope errors."""

    def query(fields: list[str]) -> subprocess.CompletedProcess:
        args = ["pr", "list", "--state", "open", "--author", author,
                "--limit", str(limit), "--json", ",".join(fields)]
        if repo:
            args += ["--repo", repo]
        return run_gh(args)

    proc = query(BASE_FIELDS + OPTIONAL_FIELDS)
    had_merge_state = True
    if proc.returncode != 0 and "scope" in (proc.stderr or "").lower():
        proc = query(BASE_FIELDS)
        had_merge_state = False
    if proc.returncode != 0:
        die((proc.stderr or "gh pr list failed").strip())
    try:
        prs = json.loads(proc.stdout or "[]")
    except json.JSONDecodeError:
        die("could not parse gh output as JSON")

    attach_commits(prs, repo)
    return prs, had_merge_state


def fetch_commits(number: int, repo: str | None) -> list[dict] | None:
    """Commits for one PR, or None if gh could not supply them.

    None and [] mean different things downstream: None is "we never got the commit
    metadata", which makes the PR fall back to its body, while [] is a genuine answer.
    """
    args = ["pr", "view", str(number), "--json", "commits"]
    if repo:
        args += ["--repo", repo]
    proc = run_gh(args)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout or "{}").get("commits") or []
    except json.JSONDecodeError:
        return None


def attach_commits(prs: list[dict], repo: str | None) -> None:
    """Populate pr["commits"] in place, one `gh pr view` per PR, run concurrently."""
    if not prs:
        return
    with ThreadPoolExecutor(max_workers=min(COMMIT_WORKERS, len(prs))) as pool:
        results = pool.map(lambda pr: fetch_commits(pr.get("number"), repo), prs)
    for pr, commits in zip(prs, results):
        pr["commits"] = commits


def clean_name(raw: str) -> str:
    """Normalise a dependency name so trailer and prose spellings line up."""
    raw = raw.strip().strip('"\'`')
    raw = re.sub(r"^\[|\]$", "", raw)          # [name](url) -> name](url)
    raw = re.sub(r"\]\(.*\)$", "", raw)
    raw = raw.strip().strip('"\'`[]')
    return raw.lower()


def version_parts(v: str) -> list[int]:
    """Leading numeric components of a version, or [] if it isn't numeric at all."""
    v = v.strip().strip('"\'`,.;:)')
    v = re.sub(r"^[\^~>=<v\s]+", "", v)
    parts: list[int] = []
    for chunk in re.split(r"[.\-+]", v):
        if chunk.isdigit():
            parts.append(int(chunk))
        else:
            break
    return parts


def bump_type(old: str, new: str) -> str:
    a, b = version_parts(old), version_parts(new)
    if not a or not b:
        return "unknown"
    width = max(len(a), len(b))
    a += [0] * (width - len(a))
    b += [0] * (width - len(b))
    if a[0] != b[0]:
        return "major"
    if width > 1 and a[1] != b[1]:
        return "minor"
    if a != b:
        return "patch"
    # Same numeric version: only a prerelease/build suffix moved.
    return "patch" if old.strip() != new.strip() else "none"


def worst(types: list[str]) -> str:
    for level in SEVERITY:
        if level in types:
            return level
    return "unknown"


def parse_trailer(body: str) -> dict[str, str | None]:
    """dependency-name -> explicit update-type (or None) from the commit trailer block."""
    deps: dict[str, str | None] = {}
    current: str | None = None
    for line in body.splitlines():
        m = re.match(r"\s*-\s*dependency-name:\s*(.+)$", line)
        if m:
            current = clean_name(m.group(1))
            deps.setdefault(current, None)
            continue
        m = re.match(r"\s*update-type:\s*version-update:semver-(\w+)", line)
        if m and current:
            deps[current] = m.group(1).lower()
    return deps


def parse_prose(text: str) -> dict[str, tuple[str, str]]:
    """dependency-name -> (from, to) from Dependabot's "Bumps X from A to B" lines."""
    found: dict[str, tuple[str, str]] = {}
    pattern = re.compile(
        r"(?:Bumps|Updates)\s+(?:the\s+)?(.+?)\s+from\s+(\S+)\s+to\s+(\S+)",
        re.IGNORECASE,
    )
    for name, old, new in pattern.findall(text):
        key = clean_name(name)
        if key and key not in found:
            found[key] = (old.strip().rstrip(".,;:"), new.strip().rstrip(".,;:"))
    return found


def strip_details(body: str) -> str:
    """Drop Dependabot's collapsed <details> blocks from a PR body.

    Those blocks carry the dependency's own release notes and changelog, which are full of
    other projects' "Bumps X from A to B" lines. Reading them as this PR's dependencies
    invents updates that aren't in the diff, so only the summary text outside them is kept.
    """
    body = re.sub(r"<details>.*?</details>", "\n", body or "", flags=re.I | re.S)
    return re.sub(r"<details>.*", "\n", body, flags=re.I | re.S)  # unclosed trailing block


def classify_updates(pr: dict) -> tuple[str, list[dict], list[str]]:
    """Return (overall bump, per-dependency detail, notes)."""
    commits = pr.get("commits")
    commit_text = "\n".join(
        f"{c.get('messageHeadline', '')}\n{c.get('messageBody', '')}"
        for c in commits or []
    )
    body_text = strip_details(pr.get("body") or "")

    notes: list[str] = []
    if commits is None:
        # Commit metadata never arrived, so the PR body is all there is. It carries the
        # version prose but not the update-type trailer, which makes this strictly weaker.
        notes.append("commit metadata unavailable; classified from the PR body alone")
        source_text = body_text
        backup_prose: dict[str, tuple[str, str]] = {}
    else:
        source_text = commit_text
        # The body only fills in versions for dependencies the commits already named — it
        # never introduces a new one, so a stray changelog line cannot invent a dependency.
        backup_prose = parse_prose(body_text)

    trailer = parse_trailer(source_text)
    prose = parse_prose(source_text + "\n" + (pr.get("title") or ""))

    names = list(trailer) + [n for n in prose if n not in trailer]
    deps: list[dict] = []

    for name in names:
        explicit = trailer.get(name)
        old, new = prose.get(name) or backup_prose.get(name) or ("", "")
        if explicit:
            kind, source = explicit, "trailer"
        elif old and new:
            kind, source = bump_type(old, new), "versions"
        else:
            kind, source = "unknown", "none"
        deps.append({"name": name, "from": old, "to": new, "bump": kind, "source": source})
        # 0.x releases are semver-minor by the letter of the spec but routinely carry
        # breaking changes, so surface them even though the default policy merges them.
        if kind == "minor" and version_parts(old)[:1] == [0]:
            notes.append(f"{name}: pre-1.0 minor ({old} -> {new}) may still break")
        if kind == "unknown":
            notes.append(f"{name}: version bump could not be determined")

    if not deps:
        return "unknown", [], notes + ["no dependency metadata found on this PR"]
    if len(deps) > 1:
        notes.insert(0, f"grouped update covering {len(deps)} dependencies")
    return worst([d["bump"] for d in deps]), deps, notes


def check_state(rollup) -> tuple[str, list[str]]:
    """Collapse the status-check rollup into one of: pass / failing / pending / none."""
    if not rollup:
        return "none", []
    failing, pending = [], []
    for check in rollup:
        name = check.get("name") or check.get("context") or "check"
        if check.get("__typename") == "CheckRun" or "status" in check:
            status = (check.get("status") or "").upper()
            conclusion = (check.get("conclusion") or "").upper()
            if status and status != "COMPLETED":
                pending.append(name)
            elif conclusion in FAILING_CONCLUSIONS:
                failing.append(name)
            elif conclusion and conclusion not in PASSING_CONCLUSIONS:
                failing.append(name)
        else:
            state = (check.get("state") or "").upper()
            if state in {"PENDING", "EXPECTED"}:
                pending.append(name)
            elif state in {"FAILURE", "ERROR"}:
                failing.append(name)
    if failing:
        return "failing", failing
    if pending:
        return "pending", pending
    return "pass", []


def evaluate(pr: dict, had_merge_state: bool) -> dict:
    bump, deps, notes = classify_updates(pr)
    checks, offenders = check_state(pr.get("statusCheckRollup"))
    merge_state = pr.get("mergeStateStatus") if had_merge_state else None
    mergeable = pr.get("mergeable")

    blockers: list[str] = []
    if bump not in {"minor", "patch", "none"}:
        blockers.append(f"{bump} version bump")
    if checks == "failing":
        blockers.append("failing checks: " + ", ".join(offenders[:4]))
    elif checks == "pending":
        blockers.append("checks still running: " + ", ".join(offenders[:4]))
    elif checks == "none":
        # No CI means there is no evidence the bump is safe — an absent gate is not a
        # passed one, so this PR only moves if the user names it deliberately.
        blockers.append("no checks configured; merge only if asked for by PR number")
    if pr.get("isDraft"):
        blockers.append("draft PR")
    if mergeable == "CONFLICTING":
        blockers.append("merge conflicts")
    if merge_state == "BEHIND":
        notes.append("branch is behind base; may need a rebase before it will merge")
    if merge_state == "UNKNOWN" or mergeable == "UNKNOWN":
        notes.append("GitHub has not finished computing mergeability; re-run to refresh")
    if merge_state == "BLOCKED":
        blockers.append("blocked by branch protection (review or required check missing)")

    return {
        "number": pr.get("number"),
        "title": pr.get("title"),
        "url": pr.get("url"),
        "branch": pr.get("headRefName"),
        "bump": bump,
        "checks": checks,
        "check_offenders": offenders,
        "mergeable": mergeable,
        "merge_state": merge_state,
        "labels": [l.get("name") for l in pr.get("labels") or []],
        "dependencies": deps,
        "notes": notes,
        "blockers": blockers,
        "eligible_by_default": not blockers,
    }


def print_table(rows: list[dict], had_merge_state: bool) -> None:
    if not rows:
        print("No open Dependabot PRs found.")
        return

    headers = ["PR", "BUMP", "CHECKS", "STATE", "OK", "TITLE"]
    table = [
        [
            f"#{r['number']}",
            r["bump"],
            r["checks"],
            (r["merge_state"] or ("-" if had_merge_state else "n/a")),
            "yes" if r["eligible_by_default"] else "no",
            (r["title"] or "")[:70],
        ]
        for r in rows
    ]
    widths = [max(len(h), *(len(row[i]) for row in table)) for i, h in enumerate(headers)]
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("  ".join("-" * w for w in widths))
    for row in table:
        print("  ".join(cell.ljust(widths[i]) for i, cell in enumerate(row)))

    print()
    for r in rows:
        detail = r["blockers"] + r["notes"]
        if detail:
            print(f"#{r['number']}:")
            for d in detail:
                print(f"  - {d}")

    eligible = [r for r in rows if r["eligible_by_default"]]
    print()
    print(f"{len(eligible)} of {len(rows)} PR(s) match the default policy "
          f"(minor/patch bump, all checks green, no blockers).")
    if eligible:
        print("Eligible: " + ", ".join(f"#{r['number']}" for r in eligible))
    if not had_merge_state:
        print("note: mergeStateStatus unavailable (token lacks the `repo` scope); "
              "branch-protection state could not be checked.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", help="OWNER/REPO (defaults to the repo in the working directory)")
    ap.add_argument("--limit", type=int, default=100, help="max PRs to fetch (default 100)")
    ap.add_argument("--author", default="app/dependabot",
                    help="PR author to filter on (default app/dependabot)")
    ap.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    args = ap.parse_args()

    prs, had_merge_state = fetch_prs(args.repo, args.author, args.limit)
    rows = [evaluate(pr, had_merge_state) for pr in prs]
    rows.sort(key=lambda r: r["number"])

    if args.json:
        print(json.dumps(rows, indent=2))
    else:
        print_table(rows, had_merge_state)


if __name__ == "__main__":
    main()

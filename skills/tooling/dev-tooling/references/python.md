# Python layer

Applies when the project has a `pyproject.toml`, `requirements*.txt`, `setup.py` or `uv.lock`.

The direction for this layer is the Astral stack: uv for environments and dependencies, Ruff for linting and formatting, ty for type checking.

## uv

- **Tier:** always for a new project; ask before converting a project managed by Poetry, pip-tools or plain requirements files.
- **Scope:** machine binary, plus `uv.lock` in the project.
- **Present when:** `uv.lock` exists.
- **Install:** `uv` itself is a machine tool. For a project with only `requirements.txt`, `uv init --bare` then `uv add -r requirements.txt` converts it; propose that, do not do it unasked.

## Ruff

- **Tier:** always
- **Present when:** `ruff` is a dev dependency, or `ruff.toml`, `.ruff.toml` or `[tool.ruff]` exists.
- **Install:** `uv add --dev ruff`. Config goes under `[tool.ruff]` in `pyproject.toml`; the defaults are reasonable, so add only a `target-version` matching `requires-python`.
- **Conflicts:** Black, isort and Flake8 are covered by Ruff. Report them as replaceable and ask; do not remove them.
- **Verify:** `uv run ruff check` and `uv run ruff format --check` run. Report the counts.

## ty

- **Tier:** always, in place of mypy or Pyright for new setups.
- **Present when:** `ty` is a dev dependency, or `ty.toml` or `[tool.ty]` exists.
- **Install:** `uv add --dev ty`.
- **Config:** under `[tool.ty]` in `pyproject.toml`. Do not also create a `ty.toml`: when both exist the `ty.toml` wins and the `pyproject.toml` settings are silently ignored.

```toml
[tool.ty.environment]
python-version = "3.13"
```

  Match `python-version` to `requires-python`.
- **Status:** ty is still 0.0.x. If mypy or Pyright is already configured, report ty as an alternative and ask; do not replace them.
- **Verify:** `uv run ty check` runs. Report the count.
- **Language server:** Serena's `python_ty` server uses it; see `agent.md`.

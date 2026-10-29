# Go layer

Applies when the project has a `go.mod` or `go.work`.

The direction for this layer is the Go toolchain itself plus one meta-linter: `gofmt` for formatting, golangci-lint v2 for everything else, `go test -race` for tests, and `go.mod` tool directives for project-pinned generators. Machine binaries such as golangci-lint and gopls are pinned through mise when the project uses it.

## Go version

- **Tier:** always
- **Scope:** project config.
- **Present when:** `go.mod` has a `go` directive. The detect script prints it per module.
- **Rules:** the `go` directive is the single source of the Go version. CI reads it with `actions/setup-go` and `go-version-file: go.mod`, so the two never drift. When the project uses mise, its `go` entry tracks the same minor; a mise pin newer than `go.mod` is fine, older is outdated.

## gofmt

- **Tier:** always
- **Scope:** project config (the check), since `gofmt` ships with Go.
- **Present when:** something fails on unformatted files: a pre-commit hook, a CI step running `gofmt -l .`, or `formatters` with `gofmt` in `.golangci.yml`. Running `go fmt` by hand does not count; nothing enforces it.
- **Wire-up:** a CI step that fails when `gofmt -l .` prints anything:

```sh
test -z "$(gofmt -l .)" || { gofmt -l .; exit 1; }
```

  Propose the same check as a pre-commit hook through the project's hook manager; with none, a tracked `.githooks/pre-commit` plus `git config core.hooksPath .githooks` (say that each clone has to run the `git config` line once).
- **Conflicts:** gofumpt and goimports are stricter supersets. If the project already runs one, it is present; do not switch it back to `gofmt`.
- **Verify:** `gofmt -l .` prints nothing, or report how many files it lists. Do not reformat them as part of the pass.

## golangci-lint

One binary that runs `go vet`, staticcheck and dozens of other linters with a shared config and cache.

- **Tier:** always
- **Scope:** machine binary, plus `.golangci.yml` in the project.
- **Present when:** `.golangci.yml` (or `.yaml`, `.toml`, `.json`) exists and the binary is on `PATH` or pinned in mise. The detect script prints the config's `version`.
- **Minimum version:** v2. A config without `version: "2"` is a v1 config, and v2 refuses it: the row is outdated. `golangci-lint migrate` converts it in place; that is an ask, because it rewrites a file the project owns.
- **Install:** a machine binary. With mise, add `golangci-lint = "latest"` under `[tools]` in the project's mise file; otherwise the upstream install script or Homebrew. Not `go get -tool`: upstream does not support building it inside the project's module, because its dependencies then resolve against the project's.
- **Config:** `.golangci.yml` at the module root. The `standard` default set (errcheck, govet, ineffassign, staticcheck, unused) plus these:

```yaml
version: "2"
linters:
  enable:
    - errorlint
    - gocritic
    - revive
    - misspell
    - nolintlint
  exclusions:
    presets:
      - std-error-handling
      - common-false-positives
    rules:
      - linters: [revive]
        text: "should have (a package )?comment"
      - linters: [revive]
        text: "unused-parameter"
```

  Why each: errorlint catches `==` and type assertions on wrapped errors; gocritic and revive cover style and correctness checks the standard set misses; misspell is cheap; nolintlint makes every `//nolint` name its linter and keeps it from going stale, so suppressions stay visible. The revive exclusions drop doc-comment rules that are noise in an application rather than a library; keep them on for a library module.

  For a service that handles HTTP or files, add `gosec` and `bodyclose` as an ask, with gosec excluded for `_test.go`:

```yaml
    rules:
      - linters: [gosec]
        path: _test\.go
```

  Generated files with the standard `// Code generated ... DO NOT EDIT.` header, such as templ's `*_templ.go` or protobuf output, are skipped by default. Add `exclusions.paths` only for generated code without that header.
- **Wire-up:** a `lint` task. In CI, `golangci/golangci-lint-action` with `version` pinned to a v2 release, so CI does not move under the project when upstream releases.
- **Conflicts:** a project running `staticcheck` or `go vet` on its own has made a smaller choice; report golangci-lint as covering both and ask. Do not remove the existing step.
- **Verify:** `golangci-lint config verify` passes, then `golangci-lint run` runs. Report the issue count by linter. Do not add exclusions to make it pass.

## Tests

- **Tier:** always
- **Present when:** CI runs `go test`.
- **Wire-up:** `go test -race ./...` in CI. If the project builds with `CGO_ENABLED=0`, set it on the build step only: `-race` needs cgo on Linux.
- **Verify:** `go test ./...` runs. Report pass and fail counts; `-race` is for CI and is slower.

## Tool directives

Since Go 1.24, `go.mod` can pin the generators and helpers a project runs, so everyone uses the same version without a separate install.

- **Tier:** usually, for project tools such as templ, stringer, sqlc or mockgen. Not for golangci-lint (see above) or gopls, which are per machine.
- **Present when:** the tool appears on a `tool` line in `go.mod`. The detect script prints them.
- **Install:** `go get -tool <module>/cmd/<name>`; run it as `go tool <name>`. Tasks and `//go:generate` lines call `go tool <name>`, never a binary expected on `PATH`.
- **Conflicts:** a `tools.go` file with blank imports is the pre-1.24 way. Moving it to tool directives is an ask.

## Generated code drift

- **Tier:** usually, when the project commits generated code: a tool directive for a generator, `//go:generate` lines, or `.templ` files.
- **Wire-up:** a CI step that regenerates and fails on a diff:

```sh
go generate ./...   # or the generator directly, such as: go tool templ generate
git diff --exit-code
```

- **Verify:** run both lines locally. A diff means the committed output is stale; report it, do not commit the regenerated files as part of the pass.

## Duplication

jscpd from `universal.md` covers Go. Add these ignores to `.jscpd.json` when they apply: `**/*_templ.go` and other generated Go files, `**/vendor/**`, and the build output directory (often `bin/` or `tmp/`). A Go project usually has no root `package.json`; run jscpd as `npx jscpd@5`, or pin it in mise as `"npm:jscpd" = "latest"` when the project uses mise.

## One check command

A Go project has no `package.json` or Composer scripts to hold it. Use the project's task runner: a mise `lint` or `check` task when mise is present, else a Makefile target if one exists. The task runs `gofmt -l`, `golangci-lint run`, jscpd and `go test ./...`. Do not add mise or a Makefile only for this; with neither, propose the commands as a CI job and a pre-commit hook.

## mise

- **Tier:** usually, when the project already has `mise.toml` or `.mise.toml`; otherwise ask.
- **Scope:** project config; the `mise` binary is per machine.
- **Why:** it pins the machine binaries this layer needs (Go, golangci-lint, gopls) per project, and its tasks hold the one check command.
- **Config:** add missing tools under `[tools]`:

```toml
[tools]
go = "1.27"
golangci-lint = "latest"
"go:golang.org/x/tools/gopls" = "latest"
```

  Match `go` to the `go.mod` directive. When the project has both `mise.toml` and `.mise.toml`, mise merges them; edit the one that already holds `[tools]`, and mention the duplicate.

## Language server

gopls, used by Serena's `go` server and by the gopls MCP server in `agent.md`. It is a machine binary: `"go:golang.org/x/tools/gopls"` in mise, or `go install golang.org/x/tools/gopls@latest`.

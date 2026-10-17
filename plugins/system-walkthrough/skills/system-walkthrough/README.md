# system-walkthrough

Builds a single-file, scroll-driven onboarding walkthrough of a codebase: a
narrative column on the left, one pinned diagram on the right that grows,
zooms and animates as the reader scrolls. Diagrams are C4-shaped scenes
written in D2; the page is plain HTML, CSS and JavaScript with no runtime
dependencies, so it opens from disk, from `python -m http.server`, or inside
any static host.

## Layout of a walkthrough directory

    walkthrough/
      story.md          the narrative and the per-step diagram state
      scenes/*.d2       one D2 file per scene (fixed layout each)
      index.html        the build output (single file)

Build: `node <skill>/scripts/build.mjs walkthrough/ [--layout tala|elk|dagre] [--lenient] [--fetch-d2]`.

## What D2 does here

D2 is the parser, the layout engine (TALA, ELK, dagre) and the SVG renderer.
It runs only at build time; the page has no dependency on it. The build finds
it in this order and never touches global configuration:

1. `$D2_BIN`, an explicit path.
2. `d2` on PATH, for example from a project's own `mise.toml`.
3. `<skill>/.bin/d2-v0.9.0/d2`, which `--fetch-d2` downloads from the GitHub
   release for this OS and CPU. `.bin/` is gitignored.

The `@terrastruct/d2` npm package was checked and rejected for now: it is a
pre-0.9 WebAssembly build with only dagre and ELK (no TALA), and ELK under
WebAssembly is very slow.

## Scenes

Each `scenes/<name>.d2` is an ordinary D2 diagram. `assets/c4.d2` is prepended
automatically, so shapes only pick a class:

    reader: Reader { class: person }
    stele: Stele { class: boundary
      portal: Portal { class: container }
      db: Postgres { class: datastore }
      portal -> db: reads { class: edge }
    }
    reader -> stele.portal: HTTPS { class: edge }

Classes: `person`, `system`, `external`, `container`, `component`, `datastore`,
`bucket`, `queue`, `boundary`, `node`, `edge`, `warn`. A scene is laid out once;
the runtime never moves shapes, it only shows, hides, dims, highlights and
re-frames them. Keep a scene under about twenty shapes; make another scene
instead of a bigger one.

Element ids are the D2 keys (`stele.portal`). Edge ids are `from->to`
(`reader->stele.portal`), with `#n` appended for a second parallel edge.
Globs: `stele.*` matches a container and everything inside it; `*` matches all;
`stele.*->*` matches edges by endpoint.

## story.md

    ---
    title: Stele
    subtitle: Self-hosted publishing for rendered artifacts
    repo: /home/hw/work/stele          absolute path, used for editor links
    remote: https://github.com/org/repo used with commit for permalinks
    commit: 32e60ef
    editor: vscode                     vscode | cursor | zed | idea
    ---

    # Chapter title
    Optional chapter intro paragraphs.

    ## Step title
    scene: containers
    reveal: reader, stele.*
    highlight: stele.worker
    camera: stele
    flow: github->stele.worker, stele.worker->stele.s3
    caption: Shown under the diagram while this step is active
    evidence: apps/worker/src/sync.ts:42, docker-compose.yml:12

    Prose in a Markdown subset: paragraphs, `- ` lists, **bold**, *em*,
    `code`, [links](url).

Directives (all optional except that the first step needs a `scene`):

- `scene:` which scene to show; inherited from the previous step if omitted.
- `reveal:` ids to add to the visible set. Visibility accumulates across
  consecutive steps on the same scene; switching scenes starts empty.
  Edges appear on their own once both endpoints are visible.
- `only:` set the visible set exactly. `all: true` reveals everything.
  `reset: true` forgets the previous step's set before applying `reveal`.
- `hide:` ids or edges to remove.
- `highlight:` ids or edges to emphasise; everything else visible is dimmed.
- `camera:` `fit` (default: frame the visible set), `all` (the whole scene),
  or a list of ids to frame.
- `flow:` ordered edges; a dot travels along them in sequence while the step
  is active, and the edges are drawn in the flow colour.
- `evidence:` comma-separated `path:line` references, repeatable. Rendered as
  editor links (and remote permalinks when `remote` and `commit` are set).
  The build fails on a path that does not exist under `repo`.

The build fails on any id that matches nothing in its scene, so typos in the
story surface immediately. Use `--lenient` to build anyway.

## Reading controls

Scroll, or press ↓ / ↑ (also j / k). The URL hash tracks the current step, so
a link to `#s-12` opens the walkthrough at that step.

The diagram can be explored without leaving the step:

- drag to pan; ctrl+wheel (or pinch) to zoom; `+` / `-` keys or buttons
- `0`, the ⤢ button, or double-click returns to the step's own framing
- `o` or the ◎ button toggles **overview**: the whole scene with every element
  shown, the ones not yet introduced drawn faintly, the current highlights kept

A manual pan or zoom is kept until the next step, which resumes the story's
camera. Overview also ends on the next step. Dimmed elements stay readable on
purpose: they are context, not noise.

## Known gaps

- Visual polish: the page is functional, not yet appealing; typography,
  colour and spacing of the page chrome deserve a design pass.
- Dark mode keeps the diagram on a light card, because D2's explicit fills
  override its dark theme.
- The mobile layout exists but has not been tested on a device.
- TALA sometimes ignores `direction` and stacks long chains vertically; the
  `camera:` directive is the workaround, splitting the scene is the fix.
- Dense scenes (around twenty shapes) are legible only with zoom; the Stele
  containers scene is the example to split.
- `--fetch-d2` does not verify a checksum of the downloaded release.
- No evals yet.

---
name: system-walkthrough
description: Build a scroll-driven, single-file HTML onboarding walkthrough of a codebase, C4-shaped, with every claim linked to the file and line that proves it. Use when the user wants to understand, onboard onto, audit, or verify the design of a system they did not fully write (vibe-coded apps especially), or asks for an architecture tour, system walkthrough, C4 diagrams with narrative, or "explain this codebase to me". Produces story.md plus D2 scenes and builds index.html with the bundled runtime. Not for a single diagram or a quick Mermaid sketch.
---

# System walkthrough

A walkthrough is a page the reader scrolls. Text on the left, one pinned diagram on the right that reveals, dims, zooms and animates as the steps go by. The reader never chooses a view; the order is the curriculum. The diagram model is C4 (context, containers, components, deployment) written in D2; the runtime is plain HTML, CSS and JavaScript with no dependencies, so the output opens from disk, under `python -m http.server`, or in any static host.

Read `README.md` in this skill for the story format, directives and scene conventions before writing anything.

## Phases

Run the phases in order and keep the files from each. Do not write prose until the inventory exists.

1. **Inventory.** Run the plugin's `system-inventory` agent (one per repository) with the repository path, an output path such as `docs/walkthrough/inventory.md`, any design documents, and layout hints. It writes a ten-section, evidence-backed inventory: purpose and actors, external systems (implemented versus design-only), containers, relationships, components, runtime flows, data, deployment, surprises, reading order. Read the whole file before drawing anything. The surprises section is the most valuable part for a vibe-coded app: adapters that are `export {}`, tables nothing reads, toggles nothing honours, ADRs ahead of code, env vars read but undocumented, claims in the README the code does not keep. Deployment and infrastructure are a section of this inventory, not a separate pass; the agent's checklist covers hosts, infrastructure code, images, CI, routing, secrets, isolation, observability and backups.

2. **Scenes.** Write `scenes/*.d2`, one per view, each laid out once. Typical set: `context`, `containers`, one per flow-heavy container (`pipeline`, `request`, `ask`), `data`, `deploy`. Use the classes from `assets/c4.d2` and mark design-only or dead elements with the `warn` class in addition to their kind. Keep a scene under about twenty shapes; make another scene rather than a bigger one. Labels take `\n`; never put `$` in a label (D2 reads it as a substitution). Avoid D2 keywords as keys (`link`, `label`, `style`, `shape`, `steps`, `layers`, `near`, `icon`, `width`, `height`, `direction`, `constraint`).

3. **Story.** Write `story.md` with this chapter arc, adapting names to the system:
   1. What it is: purpose, the people, the external systems that exist in code, the ones that exist only in design.
   2. The pieces: containers revealed one at a time with why each exists, then datastores, then the one-shots.
   3. The defining flow end to end, as `flow:` steps with the dot.
   4. Inside each container that matters, most important first, on its own scene.
   5. Where state lives: tables grouped by who reads and writes them, bucket layout.
   6. How it runs: deployment, secrets, isolation, observability, backups.
   7. Surprises: one step per disagreement, with the evidence that settles it. Each is a candidate issue.
   8. Where to start reading: the ten files in order.
   Every step gets `evidence:` lines. Write for a peer reading alone: say what the code does and where, not what it is meant to do. Keep each step to one idea and about a paragraph.

4. **Build and verify.** `node <skill>/scripts/build.mjs <dir>` (add `--fetch-d2` the first time on a machine without D2). The build fails on any id that matches nothing and any evidence file that does not exist; fix the story, not the validator. Then run the plugin's `walkthrough-verify` agent with the story path, the repository path and an output path such as `docs/walkthrough/verify.md`; it opens every evidence line and reports contradicted, unverified and imprecise claims with replacement sentences. Apply its edits. If the user described the design they expected, pass that sketch too and surface the diff in the surprises chapter. Finally open the result headless, screenshot a sample of steps by hash (`#s-12`), and look at them: check that the camera frames what the text talks about, that highlighted elements are the ones named, and that no scene is unreadably dense. Fix scenes or `camera:` directives and rebuild.

5. **Hand over.** Report the output path, how to open it, what the surprises chapter found, and which of those the owner should turn into issues. Do not commit unless asked.

## Output location

Default to `docs/walkthrough/` inside the target repository (`story.md`, `scenes/`, `index.html`). The HTML is self-contained; the story and scenes are the source to re-run after the code changes, with a new `commit:` in the front matter.

## Requirements

- D2 0.9 for layout and rendering at build time. The build takes `$D2_BIN`, then `d2` on PATH, then a skill-local copy that `--fetch-d2` downloads into `<skill>/.bin/`. Never install it globally on the user's behalf; if none is found, run the build with `--fetch-d2` or ask.
- Node 20 or newer for the build script. No npm packages.
- For screenshots, a headless Chromium through playwright-core or a similar harness.

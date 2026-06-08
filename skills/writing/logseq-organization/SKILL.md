---
name: logseq-organization
description: Use this skill whenever interacting with, formatting, generating, or modifying Logseq notes for the user. It ensures that notes, journals, tags, and namespaces conform strictly to the user's specific Logseq organization patterns and vault directory structures.
---
# Logseq Organization

This skill guides how to structure, format, and organize Logseq notes. The user has very specific conventions for directory structures, journals, namespaces (which act as folders), and block properties/tags within their Logseq vault.

## Vault Directory Structure

A standard Logseq vault has specific directories for different types of notes. ALWAYS create or modify files in their respective directories:
- **Journals**: `journals/` directory.
- **Pages**: `pages/` directory.

## Journal Organization (`journals/` directory)

All journal files MUST be placed in the `journals/` directory.
The filename format is exactly `YYYY_MM_DD.md` (e.g., `journals/2026_05_30.md`).

Within these files, the user categorizes their entries using second-level headings combined with hashtags as Logseq page links. ALWAYS use the following format for these categories. They must be second-level headings (preceded by `- ## `) so they nest properly in the Logseq outliner:
- `- ## #learnings`
- `- ## #achievements`
- `- ## #highlights`
- `- ## #links`
  - External links must ALWAYS be written in standard Markdown format: `[Link Text](https://url...)`.

**Example Journal Entry (`journals/2026_05_30.md`):**
```markdown
- ## #learnings
	- Learned about how VerticalPodAutoscaler works in Kubernetes.
- ## #links
	- [How I write HTTP services in Go](https://grafana.com/...)
```

### Referencing Journals
When linking to or referencing a Journal entry from another page or block, ALWAYS use the format `[[D MMM YYYY]]` or `[[DD MMM YYYY]]` (e.g., `[[1 Jun 2026]]`, `[[15 Aug 2025]]`). Do not use the file name format (`YYYY_MM_DD`) for inline references.

## Note Organization (`pages/` directory)

All non-journal notes MUST be placed in the `pages/` directory.

The user organizes these notes into pseudo-folders using Logseq's namespace feature. This is represented by a triple-underscore `___` in the **filename on disk**.

When **creating files** for categorized pages, ALWAYS use the `pages/<namespace>___<page-name>.md` filename format. Common namespaces include:
- **Projects**: `projects___<type>___<project-name>` (see **Project Types** below)
- **Content**: `podcasts___Highlights`, `articles___Highlights`, `books___Highlights`
- **Meetings**: `Meetings___1-1___<Person>`, `Meetings___Agenda`
- **Other areas**: `learnings___<topic>`, `Upkeep___<topic>`, `Work___<person>`

### Project Types

Projects live under the `projects` namespace and are further organized by type. Known project types:

| Type | Description | Example filename |
|------|-------------|-----------------|
| `work` | Projects at work | `pages/projects___work___platform migration.md` |
| `personal` | Hobby projects and experiments | `pages/projects___personal___learning nix.md` |
| `khidmat` | Volunteer projects for the user's community | `pages/projects___khidmat___event website.md` |

> [!IMPORTANT]
> When creating a new project page and the project type is **not obvious from context**, you MUST ask the user which type it is before creating the file. Do not guess. The user may also specify a type not listed above — use whatever they provide.

**Example File Paths:**
- `pages/projects___personal___learning nix.md`
- `pages/projects___work___ci pipeline revamp.md`
- `pages/projects___khidmat___event website.md`
- `pages/podcasts___Highlights___Supercharging Developer Productivity.md`
- `pages/Meetings___1-1___Abhay.md`

### Referencing Pages
When linking to or referencing a namespaced page from another page or block, ALWAYS use `/` (forward slash) as the namespace separator inside wikilinks — NOT `___`. The `___` convention is ONLY for filenames on disk. Logseq automatically maps `[[namespace/page]]` to the corresponding `namespace___page.md` file.

**Examples (filename → inline reference):**
- `pages/learnings___kubernetes.md` → `[[learnings/kubernetes]]`
- `pages/projects___personal___learning nix.md` → `[[projects/personal/learning nix]]`
- `pages/Meetings___1-1___Abhay.md` → `[[Meetings/1-1/Abhay]]`

## Tags and Properties

Pages and blocks are categorized using Logseq properties, primarily `tags::` and `category::`.

1. **Format**: 
   - If a tag is a single word (no spaces), prefix it with `#`: `#tagname`
   - If a tag contains a space, use the wikilinks format: `[[tag name]]` or `#[[tag name]]`
2. **Placement**: Property blocks are typically the first block on a page.
3. **Common Tags**: 
   - `#favorite`
   - `#productivity`
   - `#management`, `#leadership`
   - `#devops`, `#engineering`, `[[platform engineering]]`
   - `[[machine learning]]`, `[[AI for coding]]`
4. **Categories**: Use `category:: #podcasts` or `category:: #articles` on highlight pages.

**Example Page Header:**
```markdown
tags:: #favorite, #management, #productivity, [[platform engineering]]
category:: #articles

- Here are the notes for this article...
```

Whenever you are asked to create a new Logseq note, add an entry to a journal, or organize information, strictly adhere to these vault directory and formatting conventions.
# ADF (Atlassian Document Format) Authoring

Jira rich-text bodies — comments, descriptions — are stored as ADF, a JSON document tree. acli accepts ADF anywhere a body flag takes a file (`--body-file`, `--description-file`, `comment update --body-adf`). Plain text is fine for throwaway notes, but **any body that needs paragraphs, links, or mentions must be authored as ADF** — plain text is stored as a single flat block, and re-editing a rich comment with plain `--body` destroys its formatting.

This is a minimal authoring reference: the ~10 node types that cover real-world comments and descriptions. Full spec: https://developer.atlassian.com/cloud/jira/platform/apis/document-structure/

## Skeleton

Every document has this envelope. `version: 1` is required.

```json
{
  "type": "doc",
  "version": 1,
  "content": [ /* block nodes */ ]
}
```

## Block nodes

```json
{ "type": "paragraph", "content": [ /* inline nodes */ ] }

{ "type": "heading", "attrs": { "level": 2 }, "content": [ { "type": "text", "text": "Section" } ] }

{ "type": "codeBlock", "attrs": { "language": "bash" },
  "content": [ { "type": "text", "text": "acli jira workitem view PROJ-1" } ] }

{ "type": "bulletList", "content": [
  { "type": "listItem", "content": [
    { "type": "paragraph", "content": [ { "type": "text", "text": "First point" } ] }
  ] }
] }

{ "type": "blockquote", "content": [
  { "type": "paragraph", "content": [ { "type": "text", "text": "Quoted text" } ] }
] }

{ "type": "rule" }
```

`orderedList` mirrors `bulletList`. List items wrap their text in a `paragraph`.

## Inline nodes

Text, with optional marks:

```json
{ "type": "text", "text": "plain" }
{ "type": "text", "text": "bold", "marks": [ { "type": "strong" } ] }
{ "type": "text", "text": "italic", "marks": [ { "type": "em" } ] }
{ "type": "text", "text": "inline code", "marks": [ { "type": "code" } ] }
{ "type": "text", "text": "link text",
  "marks": [ { "type": "link", "attrs": { "href": "https://example.com/docs" } } ] }
```

Mentions (see `02-jira-workitems.md` for how to find the accountId):

```json
{ "type": "mention", "attrs": { "id": "<accountId>", "text": "@Display Name" } }
```

Line break *within* a paragraph (distinct from a new paragraph):

```json
{ "type": "hardBreak" }
```

Emoji: `{ "type": "emoji", "attrs": { "shortName": ":white_check_mark:" } }`.

## Gotchas

- **No markdown.** `**bold**` or `[text](url)` inside a `text` node renders literally. Formatting only comes from nodes and marks.
- **Bare URLs don't auto-link.** Wrap them in a `link` mark (using the URL as both `text` and `href`) if they should be clickable.
- **Paragraph breaks are separate `paragraph` nodes**, not `\n` characters — newlines inside a `text` node are ignored or collapse.
- **Marks compose**: `"marks": [ { "type": "strong" }, { "type": "em" } ]` is bold-italic.
- **Validate by round-trip**: if Jira rejects the body, the error names the offending node path. Build incrementally rather than hand-writing a large document in one go.
- To see real-world ADF for a work item's description, `workitem view PROJ-1 --json` and inspect `fields.description` — a quick way to learn the shape of anything you can create in the UI. (This does not work for comments; acli cannot read comment ADF back — see `02-jira-workitems.md`.)

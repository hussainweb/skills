---
name: capture-learning
description: >-
  Auto-capture technical realizations to Logseq when the user shares how
  tools/systems actually work. PROACTIVELY invoke without waiting to be asked.
  Pattern: declarative statements (not questions) revealing expectation vs
  reality — 'didn't know X does Y', 'turns out Z', '[tool] actually
  [behavior]', 'figured out why', 'the reason is', 'good to know', 'oh
  interesting', 'TIL', 'wait so', 'huh'. Save: non-obvious behaviors,
  corrected assumptions, debugged root causes, system quirks, newly discovered
  CLI flags or options. Skip: questions, task requests, trivial fixes,
  secondhand info (something a colleague found). Manual trigger: user says
  'capture/save/document this learning'.
---
# Capture Learning

This skill captures and documents technical realizations and learnings directly into the user's Logseq vault (`/Users/hw/logseq`).

## Trigger Conditions

- **Manual**: The user explicitly says "document this", "capture this learning", "save this realization", "TIL", or similar.
- **Automatic** — Proactively capture (then confirm) when the user:
  - Shares a debugging root cause that turned out to be non-obvious (e.g., "turns out `ignore_changes` doesn't apply to computed attributes")
  - Expresses surprise or correction about how something works ("I didn't know", "oh interesting", "huh", "good to know", "wait so X actually…")
  - Discovers a CLI flag, config option, or tool behavior they hadn't encountered before
  - Has a mental model shift — their understanding of a system fundamentally changes
  - Resolves a confusing bug and the fix reveals how the system actually behaves

  In these cases, capture the learning first, then say something like: *"I've saved this to your Logseq vault — let me know if you'd like to adjust the wording."*

## When NOT to trigger
- Routine changes with no new insight (simple refactors, typo fixes, straightforward tasks)
- Information the user clearly already knew and was just explaining to you
- Secondhand info — something a colleague or someone else discovered, not the user
- Generic best practices that aren't specific to the user's stack or project
- The user is asking a question (not sharing a realization)

## Execution Workflow

When capturing a learning:
1. **Summarize the Learning**: Formulate a concise, clear explanation of the realization (what it is, why it works that way, and any context or code snippets that illustrate it). The top line of the entry must focus on meaningful text describing the learning, rather than starting with tags. Place any relevant tags at the end of the line or in nested blocks.
2. **Search for Related Content (Namespaces Preferred)**: Before creating a new page or defaulting to the daily journal, use search tools (`grep_search`, `glob`) to check the `/Users/hw/logseq` vault for existing, relevant pages. Look for matching namespaces (e.g., existing `learnings___` or `projects___` pages related to the topic).
3. **Apply Logseq Conventions**: You MUST activate and use the `logseq-organization` skill to format and place the note correctly based on the search results.
   - If related pages exist, append the learning to the most relevant existing page under an appropriate heading.
   - If no relevant page exists and the learning is small/isolated, add it to today's daily journal under the `- ## #learnings` heading.
   - If no relevant page exists and the learning is substantial or forms a comprehensive new topic, ask the user if they'd like to create a specific learning page (e.g., `pages/learnings___<topic-name>.md`).
4. **Link Source Context**: ALWAYS link the relevant project page (e.g., `[[projects/personal/saalnaama]]`) when capturing a learning, especially in the daily journal. This provides essential context for where the learning originated.
5. **Write to Vault**: Use file writing tools to append or write the formatted entry to the chosen file in `/Users/hw/logseq`.
6. **Confirm**: Provide the user with a brief confirmation and a snippet of what was saved.

## Examples of Learnings
- "Terraform write-only resources for secrets don't store state in the clear."
- "Drupal canvas stores its content as base64-encoded strings in a specific database table."
- "Kubernetes VerticalPodAutoscaler evicts pods to apply new resource requests."
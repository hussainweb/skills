---
name: capture-learning
description: Automatically or manually captures technical realizations, "aha!" moments, and new understandings, documenting them in the user's Logseq vault using established organization conventions. Triggers when the user says things like "I just realized", "capture this learning", or when the agent helps resolve a complex issue and uncovers how a system fundamentally works.
---
# Capture Learning

This skill captures and documents technical realizations and learnings directly into the user's Logseq vault (`/Users/hw/logseq`).

## Trigger Conditions
- **Manual**: The user explicitly asks to "document this", "capture this learning", or "save this realization".
- **Automatic**: When you (the agent) and the user figure out how something complex works under the hood (e.g., resolving a tricky bug, understanding an undocumented API, or grasping a framework's architecture), proactively ask the user: *"Would you like me to document this learning in your Logseq vault?"*

## Execution Workflow

When capturing a learning:
1. **Summarize the Learning**: Formulate a concise, clear explanation of the realization (what it is, why it works that way, and any context or code snippets that illustrate it).
2. **Search for Related Content**: Before creating a new page or defaulting to the daily journal, use search tools (`grep_search`, `glob`) to check the `/Users/hw/logseq` vault for existing, relevant pages. Look for matching namespaces (e.g., existing `learnings___` or `projects___` pages related to the topic).
3. **Apply Logseq Conventions**: You MUST activate and use the `logseq-organization` skill to format and place the note correctly based on the search results.
   - If related pages exist, append the learning to the most relevant existing page under an appropriate heading.
   - If no relevant page exists and the learning is small/isolated, add it to today's daily journal under the `- ## #learnings` heading.
   - If no relevant page exists and the learning is substantial or forms a comprehensive new topic, ask the user if they'd like to create a specific learning page (e.g., `pages/learnings___<topic-name>.md`).
4. **Write to Vault**: Use file writing tools to append or write the formatted entry to the chosen file in `/Users/hw/logseq`.
5. **Confirm**: Provide the user with a brief confirmation and a snippet of what was saved.

## Examples of Learnings
- "Terraform write-only resources for secrets don't store state in the clear."
- "Drupal canvas stores its content as base64-encoded strings in a specific database table."
- "Kubernetes VerticalPodAutoscaler evicts pods to apply new resource requests."
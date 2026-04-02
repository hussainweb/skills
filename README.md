# AI Coding Agent Skills

A collection of specialized skills for AI coding agents to enhance development workflows. Skills are tool-agnostic instruction sets that work with any AI agent that supports the skills format (Gemini CLI, Claude Code, etc.).

## Installation

Install all skills from this repository into your AI coding agent using the [`skills` CLI](https://skills.sh/docs/cli):

```bash
npx skills add hussainweb/skills
```

This downloads the skills and configures them for use with your AI agent.

## Available Skills

### Drupal

Modern Drupal development skills following Drupal 11+ and PHP 8.5 standards.

| Skill | Install | Description |
|-------|---------|-------------|
| [drupal-new-module](./skills/drupal/drupal-new-module/SKILL.md) | `npx skills add hussainweb/skills@drupal-new-module` | Scaffold new Drupal 11 modules with PSR-4 namespaces, OOP hooks, and modern PHP patterns |
| [drupal-review](./skills/drupal/drupal-review/SKILL.md) | `npx skills add hussainweb/skills@drupal-review` | Review Drupal code against team standards, security best practices, and caching requirements |
| [drupal-theme-review](./skills/drupal/drupal-theme-review/SKILL.md) | `npx skills add hussainweb/skills@drupal-theme-review` | Review Drupal theme code — Twig templates, libraries, JS behaviors, SDC, accessibility, and responsive images |

### DDEV

Local development environment management with DDEV.

| Skill | Install | Description |
|-------|---------|-------------|
| [ddev](./skills/ddev/ddev/SKILL.md) | `npx skills add hussainweb/skills@ddev` | Guide command execution in DDEV-based projects — route commands through containers, manage add-ons, and configure services |

## Repository Structure

Skills are organized by technology or domain under the `skills/` directory:

```text
skills/
├── ddev/
│   └── ddev/
│       ├── SKILL.md
│       ├── references/
│       └── evals/
└── drupal/
    ├── drupal-new-module/
    │   ├── SKILL.md
    │   ├── references/
    │   └── evals/
    ├── drupal-review/
    │   ├── SKILL.md
    │   ├── references/
    │   └── evals/
    └── drupal-theme-review/
        ├── SKILL.md
        ├── references/
        └── evals/
```

## Skill Anatomy

Each skill lives in its own directory and contains:

- **`SKILL.md`** — The instruction set and metadata (name, description, allowed tools, argument hints).
- **`references/`** — Supporting reference documentation the skill can consult.
- **`evals/`** — Evaluation sets to test the skill's output quality.

## Adding New Skills

1. Create a new directory under the appropriate category in `skills/` (or create a new category directory).
2. Add a `SKILL.md` with frontmatter metadata and instructions.
3. Optionally add `references/` and `evals/` directories.
4. Update this README with the new skill.

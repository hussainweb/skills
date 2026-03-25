# Gemini CLI Skills

A collection of specialized skills for the [Gemini CLI](https://github.com/google/gemini-cli) to enhance development workflows.

## 🚀 Usage

To use these skills, ensure they are in your Gemini CLI skills directory (typically `~/.agents/skills/` or indexed in your workspace). You can activate a skill by name:

```bash
# In a Gemini CLI session
activate_skill drupal-new-module
```

## 📂 Categories

### 💧 Drupal
Modern Drupal development skills following Drupal 11+ and PHP 8.4/8.5 standards.

- **[drupal-new-module](./drupal/drupal-new-module/SKILL.md)**: Scaffolds new Drupal 11 modules with PSR-4 namespaces, OOP hooks, and modern PHP patterns.
- **[drupal-review](./drupal/drupal-review/SKILL.md)**: Reviews Drupal code against team standards, security best practices, and caching requirements.

## 🛠️ Repository Structure

The skills are organized by technology or domain:

```text
.
├── drupal/                # Drupal-specific skills
│   ├── drupal-new-module/ # Module scaffolding
│   └── drupal-review/     # Code review and auditing
└── README.md
```

## ✍️ Adding New Skills

Each skill should be contained in its own directory with:
1. `SKILL.md`: The instruction set and metadata for the Gemini CLI.
2. `evals/`: (Optional) Evaluation sets to test the skill's performance.

When adding a new category, create a new top-level directory and update this README.

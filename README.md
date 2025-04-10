# PR Description Validator Action

A GitHub Action that enforces standards for PR descriptions based on configurable rules.

This action helps maintain high-quality pull requests by validating:

- Required sections in PR descriptions
- Required checkboxes are checked
- Semantic commit messages
- Issue references
- Label requirements

## Usage

Add this action to your workflow file:

```yaml
name: PR Validation

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

jobs:
  validate-pr:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Validate PR Description
        uses: your-org/pr-description-enforce@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: Path to a custom config file
          # config-path: '.github/my-custom-config.yml'
```

## Configuration

The validation rules can be configured in two ways:

### 1. PR Template Front Matter (Recommended)

Add YAML front matter to your PR template:

```markdown
---
validation:
  issue_number: required
  require_labels: true
  semantic_commits:
    enabled: true
    types:
      - feat
      - fix
      - docs
      # ... other types
  sections:
    "Type of review":
      rule: any_checked
    "Review Checklist":
      rule: any_checked
---

# Your PR template content here
```

### 2. External Configuration File

Create a `.github/pr-validation-config.yml` file:

```yaml
issue_number: required
require_labels: true
semantic_commits:
  enabled: true
  types:
    - feat
    - fix
    # ... other types
sections:
  "Type of review":
    rule: any_checked
  "Review Checklist":
    rule: any_checked
```

## Configuration Options

| Option                            | Description                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `issue_number`                    | When set to `required`, PRs must reference an issue using "Fixes: #123" format |
| `require_labels`                  | When `true`, PRs must have at least one label                                  |
| `semantic_commits.enabled`        | When `true`, commit messages must follow semantic conventions                  |
| `semantic_commits.types`          | List of allowed commit types (e.g., feat, fix, docs, etc.)                     |
| `semantic_commits.allowed_scopes` | Optional list of allowed scopes for commits                                    |
| `sections`                        | Map of PR sections to validate, with each having validation rules              |

### Section Rules

Each section can have the following rules:

- `rule: any_checked` - At least one checkbox in the section must be checked
- `rule: all_checked` - All checkboxes in the section must be checked
- `enforce_nested: true` - If a parent checkbox is checked, all its children must also be checked

## Inputs

| Input           | Description                                      | Required | Default                                                    |
| --------------- | ------------------------------------------------ | -------- | ---------------------------------------------------------- |
| `config-path`   | Path to custom validation config                 | No       | Uses PR front matter or `.github/pr-validation-config.yml` |
| `fail-on-error` | Whether to fail the workflow if validation fails | No       | `true`                                                     |
| `github-token`  | GitHub token for API access                      | No       | `${{ github.token }}`                                      |

## Outputs

| Output              | Description                                 |
| ------------------- | ------------------------------------------- |
| `validation-result` | Result of validation (`passed` or `failed`) |
| `validation-errors` | List of validation errors found             |

## License

MIT

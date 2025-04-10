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
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # Optional: Path to a PR template with validation rules
          # template_path: '.github/PULL_REQUEST_TEMPLATE.md'
          # Optional: Path to a custom config file
          # config_path: '.github/my-custom-config.yml'
```

## Configuration

The validation rules can be configured in three ways (in order of precedence):

### 1. PR Template File (Most Secure)

Add YAML front matter to your PR template file (default: `.github/PULL_REQUEST_TEMPLATE.md`):

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

This approach is most secure as users cannot modify the validation rules when creating a PR.

### 2. PR Description Front Matter

If a valid configuration is not found in the PR template file, the action will look for front matter in the PR description:

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
  sections:
    "Type of review":
      rule: any_checked
---

# Your PR content here
```

### 3. External Configuration File

As a last resort, the action will look for a configuration file (default: `.github/pr-validation-config.yml`):

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

| Input             | Description                                      | Required | Default                                |
| ----------------- | ------------------------------------------------ | -------- | -------------------------------------- |
| `template_path`   | Path to PR template with validation rules        | No       | `.github/PULL_REQUEST_TEMPLATE.md`     |
| `config_path`     | Path to custom validation config                 | No       | `.github/pr-validation-config.yml`     |
| `fail_on_error`   | Whether to fail the workflow if validation fails | No       | `true`                                 |
| `github_token`    | GitHub token for API access                      | No       | `${{ github.token }}`                  |

## Outputs

| Output              | Description                                 |
| ------------------- | ------------------------------------------- |
| `validation-result` | Result of validation (`passed` or `failed`) |
| `validation-errors` | List of validation errors found             |

## License

MIT

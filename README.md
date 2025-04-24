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
      - uses: actions/checkout@v4

      - name: Validate PR Description
        uses: your-org/pr-description-enforce@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          # Path to configuration file (.md files use frontmatter, .yml/.yaml are direct config)
          # config_file: '.github/PULL_REQUEST_TEMPLATE.md'
```

## Configuration

The validation rules can be configured in two ways:

### 1. Markdown PR Template with Front Matter (Most Secure)

Add YAML front matter, in a comment, to your PR template file (default: `.github/PULL_REQUEST_TEMPLATE.md`):

```markdown
<!--
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
-->

# Your PR template content here
```

### 2. Direct YAML Configuration File

Alternatively, you can use a direct YAML configuration file by setting the `config_file` parameter to a `.yml` or `.yaml` file:

```yaml
# In .github/pr-validation-config.yml
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

### Fallback: PR Body Frontmatter (Not Recommended for Enforcement)

As a last resort, if the specified configuration file is not found, the action will look for frontmatter in the PR description itself. This approach is not recommended for enforcement purposes as users can modify these rules to bypass validation.

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

| Input           | Description                                                                       | Required | Default                            |
| --------------- | --------------------------------------------------------------------------------- | -------- | ---------------------------------- |
| `config_file`   | Path to configuration file (.md with frontmatter or .yml/.yaml for direct config) | No       | `.github/PULL_REQUEST_TEMPLATE.md` |
| `fail_on_error` | Whether to fail the workflow if validation fails                                  | No       | `true`                             |
| `github_token`  | GitHub token for API access                                                       | No       | `${{ github.token }}`              |

## Outputs

| Output              | Description                                 |
| ------------------- | ------------------------------------------- |
| `validation-result` | Result of validation (`passed` or `failed`) |
| `validation-errors` | List of validation errors found             |

## License

MIT

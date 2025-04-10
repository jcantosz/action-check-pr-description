// Import the shared ValidationResult class
import { ValidationResult } from "../types.js";
import * as core from "@actions/core";

/**
 * Fetches all commits in a pull request
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub Actions context
 * @returns {Promise<Array>} List of commits
 */
async function getCommits(github, context) {
  const { owner, repo } = context.repo;
  const pull_number = context.payload.pull_request.number;

  core.info(`📥 Fetching commits for PR #${pull_number} in ${owner}/${repo}...`);

  if (context.payload.pull_request.commits && Array.isArray(context.payload.pull_request.included_commits)) {
    core.debug(`Using ${context.payload.pull_request.included_commits.length} commits from event payload`);
    return context.payload.pull_request.included_commits;
  }

  try {
    core.debug(`Fetching commits from GitHub API...`);
    // Using direct request method instead of REST plugin
    const { data } = await github.request("GET /repos/{owner}/{repo}/pulls/{pull_number}/commits", {
      owner,
      repo,
      pull_number,
    });

    core.info(`✅ Successfully fetched ${data.length} commits from GitHub API`);
    return data;
  } catch (error) {
    core.error(`❌ Failed to fetch commits: ${error.message}`);
    throw error;
  }
}

/**
 * Validates a single commit message against semantic conventions
 * @param {Object} commit - Commit object from GitHub API
 * @param {string[]} allowedTypes - List of allowed commit types
 * @param {string[]|null} allowedScopes - List of allowed scopes or null for any
 * @returns {ValidationResult} Validation result with error details if invalid
 */
function validateCommitMessage(commit, allowedTypes, allowedScopes) {
  const sha = commit.sha.substring(0, 7);
  const message = commit.commit.message.split("\n")[0].trim();

  core.debug(`Validating commit: ${sha} - ${message}`);

  const semanticPattern = /^([a-z]+)(?:\(([a-z0-9-_]+)\))?!?: (.+)$/i;
  const match = message.match(semanticPattern);

  if (!match) {
    core.warning(`❌ Commit ${sha} does not follow semantic format`);
    return new ValidationResult(false, {
      sha,
      message,
      error: "Does not follow semantic format: type(scope): subject",
    });
  }

  const [_, type, scope, subject] = match;
  core.debug(`Commit ${sha} - type: ${type}, scope: ${scope || "none"}, subject: ${subject}`);

  if (allowedTypes.length > 0 && !allowedTypes.includes(type.toLowerCase())) {
    core.warning(`❌ Commit ${sha} has invalid type: ${type}`);
    return new ValidationResult(false, {
      sha,
      message,
      error: `Type "${type}" is not allowed. Use one of: ${allowedTypes.join(", ")}`,
    });
  }

  if (scope && allowedScopes && !allowedScopes.includes(scope.toLowerCase())) {
    core.warning(`❌ Commit ${sha} has invalid scope: ${scope}`);
    return new ValidationResult(false, {
      sha,
      message,
      error: `Scope "${scope}" is not allowed. Use one of: ${allowedScopes.join(", ")}`,
    });
  }

  core.debug(`✅ Commit ${sha} is valid`);
  return new ValidationResult(true);
}

/**
 * Validates all commits in a PR follow semantic conventions
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub Actions context
 * @param {Object} semanticConfig - Semantic validation configuration
 * @param {string[]} errors - Array to collect validation errors
 */
async function validateSemanticCommits(github, context, semanticConfig, errors) {
  try {
    core.info(`🔍 Validating PR commits against semantic convention rules...`);
    core.debug(`Semantic config: ${JSON.stringify(semanticConfig)}`);

    const allowedTypes = semanticConfig.types || [];
    if (allowedTypes.length > 0) {
      core.debug(`Allowed commit types: ${allowedTypes.join(", ")}`);
    } else {
      core.info(`No commit type restrictions configured, allowing all types`);
    }

    if (semanticConfig.allowed_scopes) {
      core.debug(`Allowed scopes: ${semanticConfig.allowed_scopes.join(", ")}`);
    }

    const commits = await getCommits(github, context);
    core.info(`Validating ${commits.length} commit(s) in PR #${context.payload.pull_request.number}`);

    const invalidCommits = [];

    for (const commit of commits) {
      const result = validateCommitMessage(commit, semanticConfig.types || [], semanticConfig.allowed_scopes);
      if (!result.isValid) {
        invalidCommits.push(result.error);
      }
    }

    if (invalidCommits.length > 0) {
      core.error(`❌ Found ${invalidCommits.length} invalid commit(s) out of ${commits.length} total`);
      errors.push("The following commits do not follow the semantic commit convention:");
      invalidCommits.forEach((commitError) => {
        errors.push(`  • ${commitError.sha} - ${commitError.message} - ${commitError.error}`);
      });
    } else {
      core.info(`✅ All ${commits.length} commit(s) follow semantic convention`);
    }
  } catch (error) {
    core.error(`❌ Failed to validate semantic commits: ${error.message}`);
    errors.push(`Failed to validate semantic commits: ${error.message}`);
  }
}

export { validateSemanticCommits, validateCommitMessage, getCommits };

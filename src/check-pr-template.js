import * as core from "@actions/core";
import { loadValidationConfig } from "./config.js";
import { validateSemanticCommits } from "./validators/commits.js";
import { validateSection } from "./validators/checkboxes.js";

/**
 * Validates that required labels are present on the PR
 * @param {Object} pullRequest - GitHub pull request object
 * @param {string[]} errors - Array to collect validation errors
 */
function validateLabels(pullRequest, errors) {
  core.debug(`Validating PR labels. Found ${pullRequest.labels?.length || 0} labels.`);
  const labels = pullRequest.labels || [];

  if (labels.length === 0) {
    core.warning("No labels found on this pull request");
    errors.push("At least one label must be applied to this pull request");
  } else {
    const labelNames = labels.map((label) => label.name).join(", ");
    core.info(`PR has the following labels: ${labelNames}`);
  }
}

/**
 * Validates that PR references an issue number
 * @param {string} prBody - PR description body
 * @param {string[]} errors - Array to collect validation errors
 */
function validateIssueReference(prBody, errors) {
  core.debug("Validating issue reference in PR description");

  // List of all valid GitHub issue linking keywords
  const keywords = ["close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved"];

  // Create a regex pattern with all keywords (case insensitive)
  const keywordPattern = keywords.join("|");

  // Match:
  // 1. Any of the keywords followed by optional colon and whitespace
  // 2. Either:
  //    a. A hash followed by digits (same repo: #123)
  //    b. A repo reference followed by hash and digits (cross-repo: owner/repo#123)
  const issueRegex = new RegExp(
    `(?:${keywordPattern})(?:\\s*:\\s*|\\s+)((?:[a-zA-Z0-9_.-]+\\/[a-zA-Z0-9_.-]+)?#\\d+)`,
    "i"
  );

  const issueMatch = prBody.match(issueRegex);

  if (!issueMatch || !issueMatch[1]) {
    core.warning("No issue reference found in PR description");
    errors.push(
      "Required issue reference is missing. Use a format like 'Fixes: #123' or 'Closes owner/repo#456' " +
        "in your PR description."
    );
  } else {
    core.info(`Found issue reference: ${issueMatch[1]}`);
  }
}

/**
 * Extracts content of a named section from PR body
 * @param {string} prBody - PR description body
 * @param {string} sectionName - Name of section to extract
 * @returns {string} Section content or empty string if not found
 */
function getSectionContent(prBody, sectionName) {
  core.debug(`Looking for section "${sectionName}" in PR description`);

  // Escape special regex characters in section name
  const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(`### ${escapedSectionName}\\s*\\n([\\s\\S]*?)(?=###|$)`, "i");
  const content = (prBody.match(sectionPattern)?.[1] || "").trim();

  if (!content) {
    core.debug(`Section "${sectionName}" not found or empty`);
  } else {
    core.debug(`Found section "${sectionName}" with ${content.split("\n").length} lines`);
  }

  return content;
}

/**
 * Validates a pull request against configured rules
 * @param {Object} params - The parameters object
 * @param {Object} params.github - GitHub API client
 * @param {Object} params.context - GitHub Actions context
 * @returns {Promise<boolean>} - True if validation passes, false otherwise
 */
async function validatePullRequest({ github, context }) {
  core.info("🔍 Starting PR validation process...");

  if (!context.payload.pull_request) {
    core.setFailed("❌ This action can only be run on pull request events");
    return false;
  }

  core.info(`📋 Validating PR #${context.payload.pull_request.number}: ${context.payload.pull_request.title}`);

  const prBody = context.payload.pull_request.body || "";
  let validationConfig;

  try {
    core.info("🔧 Loading validation configuration...");
    validationConfig = loadValidationConfig(prBody);
    core.debug(`Loaded validation config: ${JSON.stringify(validationConfig, null, 2)}`);
  } catch (error) {
    core.setFailed(`❌ Failed to parse validation config: ${error.message}`);
    return false;
  }

  if (!validationConfig) {
    core.setFailed("❌ No validation configuration found");
    return false;
  }

  const errors = [];

  // Track validation steps for summary
  const validationSteps = [];

  // Validate labels if required
  if (validationConfig.require_labels) {
    core.info("🏷️ Validating PR labels...");
    const errorCount = errors.length;
    validateLabels(context.payload.pull_request, errors);
    validationSteps.push({
      name: "Labels",
      status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
    });
  } else {
    core.debug("Label validation skipped (not required in config)");
  }

  // Validate issue reference if required
  if (validationConfig.issue_number === "required") {
    core.info("🔗 Validating issue reference...");
    const errorCount = errors.length;
    validateIssueReference(prBody, errors);
    validationSteps.push({
      name: "Issue Reference",
      status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
    });
  } else {
    core.debug("Issue reference validation skipped (not required in config)");
  }

  // Validate semantic commits if enabled
  if (validationConfig.semantic_commits?.enabled) {
    core.info("📝 Validating semantic commits...");
    const errorCount = errors.length;
    await validateSemanticCommits(github, context, validationConfig.semantic_commits, errors);
    validationSteps.push({
      name: "Semantic Commits",
      status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
    });
  } else {
    core.debug("Semantic commit validation skipped (not enabled in config)");
  }

  // Validate section checkboxes
  if (validationConfig.sections) {
    core.info("📋 Validating PR template sections...");

    Object.entries(validationConfig.sections).forEach(([sectionName, sectionConfig]) => {
      core.info(`📋 Validating section "${sectionName}"...`);
      const errorCount = errors.length;

      const sectionContent = getSectionContent(prBody, sectionName);
      if (!sectionContent) {
        errors.push(`Section "${sectionName}" not found in PR description`);
        validationSteps.push({
          name: `Section: ${sectionName}`,
          status: "❌ Failed (Section not found)",
        });
        return;
      }

      validateSection(sectionName, sectionConfig, sectionContent, errors);
      validationSteps.push({
        name: `Section: ${sectionName}`,
        status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
      });
    });
  } else {
    core.debug("Section validation skipped (no sections defined in config)");
  }

  // Report validation results
  if (errors.length > 0) {
    core.info("❌ PR validation failed with the following errors:");
    errors.forEach((error) => {
      core.error(`  - ${error}`);
    });

    // Print validation summary
    core.info("\n📊 Validation Summary:");
    validationSteps.forEach((step) => {
      core.info(`  ${step.status} ${step.name}`);
    });

    core.setFailed(errors.join("\n"));
    return false;
  }

  // Print validation summary
  core.info("\n📊 Validation Summary:");
  validationSteps.forEach((step) => {
    core.info(`  ${step.status} ${step.name}`);
  });

  core.info("✅ Pull request validation passed successfully!");
  return true;
}

export { validatePullRequest, validateLabels, validateIssueReference, getSectionContent };

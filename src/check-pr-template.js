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
 * Validates that PR has the required number of assignees
 * @param {Object} pullRequest - GitHub pull request object
 * @param {number} minAssignees - Minimum number of assignees required
 * @param {string[]} errors - Array to collect validation errors
 */
function validateAssignees(pullRequest, minAssignees, errors) {
  core.debug(`Validating PR assignees. Required: ${minAssignees}, Found: ${pullRequest.assignees?.length || 0}`);
  const assignees = pullRequest.assignees || [];

  if (assignees.length < minAssignees) {
    core.warning(`PR has only ${assignees.length} assignees, but ${minAssignees} are required`);

    if (assignees.length === 0) {
      errors.push(`This pull request requires at least ${minAssignees} assignee(s). Currently no one is assigned.`);
    } else {
      const assigneeNames = assignees.map((assignee) => assignee.login).join(", ");
      errors.push(
        `This pull request requires at least ${minAssignees} assignee(s). Currently assigned: ${assigneeNames}`
      );
    }
  } else {
    const assigneeNames = assignees.map((assignee) => assignee.login).join(", ");
    core.info(`PR has sufficient assignees: ${assigneeNames}`);
  }
}

/**
 * Validates that PR has the required number of reviewers
 * @param {Object} pullRequest - GitHub pull request object
 * @param {number} minReviewers - Minimum number of reviewers required
 * @param {string[]} errors - Array to collect validation errors
 */
function validateReviewers(pullRequest, minReviewers, errors) {
  const requestedReviewers = [...(pullRequest.requested_reviewers || []), ...(pullRequest.requested_teams || [])];
  const reviewCount = requestedReviewers.length;

  core.debug(`Validating PR reviewers. Required: ${minReviewers}, Found: ${reviewCount}`);

  if (reviewCount < minReviewers) {
    core.warning(`PR has only ${reviewCount} reviewers requested, but ${minReviewers} are required`);

    if (reviewCount === 0) {
      errors.push(
        `This pull request requires at least ${minReviewers} reviewer(s). Currently no reviews are requested.`
      );
    } else {
      const reviewerNames = requestedReviewers
        .map((reviewer) => reviewer.login || `${reviewer.name} (team)`)
        .join(", ");
      errors.push(
        `This pull request requires at least ${minReviewers} reviewer(s). Currently requested: ${reviewerNames}`
      );
    }
  } else {
    const reviewerNames = requestedReviewers.map((reviewer) => reviewer.login || `${reviewer.name} (team)`).join(", ");
    core.info(`PR has sufficient reviewers requested: ${reviewerNames}`);
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
 * Writes validation summary to GitHub Actions step summary
 * @param {Object[]} validationSteps - Array of validation steps and their results
 * @param {boolean} success - Whether overall validation was successful
 * @param {string[]} errors - Array to collect validation errors
 */
async function writeStepSummary(validationSteps, success, errors) {
  try {
    core.debug("Writing validation results to step summary");

    // Start with a header
    core.summary.addHeading("PR Description Validation Results").addEOL();

    // Add table header
    core.summary
      .addTable([
        [
          { data: "Validation Check", header: true },
          { data: "Result", header: true },
        ],
        ...validationSteps.map((step) => [step.name, step.status]),
      ])
      .addEOL();

    // Add overall status
    if (success) {
      core.summary.addHeading("✅ Overall: PASSED", 3).addEOL();
    } else {
      core.summary.addHeading("❌ Overall: FAILED", 3).addEOL().addHeading("Errors:", 4).addEOL();

      // Add error list
      for (const error of errors) {
        core.summary.addRaw(`- ${error}`).addEOL();
      }
    }

    // Write the summary to the GitHub Actions summary
    await core.summary.write();
  } catch (error) {
    core.warning(`Failed to write step summary: ${error.message}`);
  }
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
    // Pass GitHub client and context to allow fetching from specified branch
    validationConfig = await loadValidationConfig(prBody, github, context);

    // Make sure we have a valid object
    if (!validationConfig) {
      validationConfig = {};
    }

    core.debug(`Loaded validation config: ${JSON.stringify(validationConfig, null, 2)}`);
  } catch (error) {
    core.setFailed(`❌ Failed to parse validation config: ${error.message}`);
    return false;
  }

  const errors = [];

  // Track validation steps for summary
  const validationSteps = [];

  // Validate labels if require_labels is explicitly set to true
  if (validationConfig.require_labels === true) {
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

  // Validate assignees if require_assignees is specified and > 0
  if (validationConfig.require_assignees && validationConfig.require_assignees > 0) {
    core.info(`👤 Validating PR has at least ${validationConfig.require_assignees} assignee(s)...`);
    const errorCount = errors.length;
    validateAssignees(context.payload.pull_request, validationConfig.require_assignees, errors);
    validationSteps.push({
      name: "Assignees",
      status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
    });
  } else {
    core.debug("Assignee validation skipped (not required in config)");
  }

  // Validate reviewers if require_reviewers is specified and > 0
  if (validationConfig.require_reviewers && validationConfig.require_reviewers > 0) {
    core.info(`👁️ Validating PR has at least ${validationConfig.require_reviewers} reviewer(s)...`);
    const errorCount = errors.length;
    validateReviewers(context.payload.pull_request, validationConfig.require_reviewers, errors);
    validationSteps.push({
      name: "Reviewers",
      status: errors.length === errorCount ? "✅ Passed" : "❌ Failed",
    });
  } else {
    core.debug("Reviewer validation skipped (not required in config)");
  }

  // Validate issue reference only if issue_number is explicitly set to "required"
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

  // Validate semantic commits only if semantic_commits.enabled is explicitly set to true
  if (validationConfig.semantic_commits?.enabled === true) {
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

  // Validate section checkboxes only if sections is defined and non-empty
  if (validationConfig.sections && Object.keys(validationConfig.sections).length > 0) {
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

  // Write summary to GitHub Actions step summary
  const success = errors.length === 0;
  await writeStepSummary(validationSteps, success, errors);

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

export {
  validatePullRequest,
  validateLabels,
  validateIssueReference,
  validateAssignees,
  validateReviewers,
  getSectionContent,
};

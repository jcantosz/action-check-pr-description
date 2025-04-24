import * as core from "@actions/core";
import * as github from "@actions/github";
import { Octokit } from "@octokit/core";
import { validatePullRequest } from "./src/check-pr-template.js";

/**
 * Main GitHub Action function
 */
export async function run() {
  try {
    core.info("🚀 Starting PR Description Validator Action");

    // Get inputs
    const configPath = core.getInput("config_path");
    const configBranch = core.getInput("config_branch");
    const failOnError = core.getInput("fail_on_error") === "true";
    const token = core.getInput("github_token");

    // Log action configuration
    core.info("📋 Action Configuration:");
    core.info(`  - Using ${configPath ? "custom config path: " + configPath : "default config path"}`);
    if (configBranch) {
      core.info(`  - Using config from branch: ${configBranch}`);
    } else {
      core.info("  - Using config from current branch");
    }
    core.info(`  - Fail on error: ${failOnError ? "Yes" : "No"}`);

    // Create an authenticated basic Octokit instance
    const octokit = new Octokit({ auth: token });

    // Store custom config path if provided
    if (configPath) {
      process.env.CUSTOM_CONFIG_PATH = configPath;
      core.debug(`Set custom config path environment variable to: ${configPath}`);
    }

    // Store config branch if provided
    if (configBranch) {
      process.env.CONFIG_BRANCH = configBranch;
      core.debug(`Set config branch environment variable to: ${configBranch}`);
    }

    // Create context with octokit instance
    const actionContext = {
      ...github.context,
      octokit,
    };

    core.info(
      `🔍 Processing PR #${github.context.payload.pull_request?.number || "?"} in ${github.context.repo.owner}/${
        github.context.repo.repo
      }`
    );

    // Show debug context info for troubleshooting
    core.debug(`Event name: ${github.context.eventName}`);
    core.debug(`Action: ${github.context.payload.action || "unknown"}`);
    core.debug(`Actor: ${github.context.actor}`);

    // Validate the pull request
    const success = await validatePullRequest({
      github: octokit,
      context: github.context,
    });

    // Set outputs
    core.setOutput("validation-result", success ? "passed" : "failed");

    if (!success && failOnError) {
      // The validatePullRequest function already calls core.setFailed internally
      core.info("❌ Action failing due to validation errors and fail-on-error=true");
    } else if (!success) {
      // Just log the errors but don't fail the workflow
      core.warning("⚠️ PR validation had errors but the action is configured not to fail");
    } else {
      core.info("✅ Action completed successfully!");
    }
  } catch (error) {
    core.setFailed(`❌ Action failed with error: ${error.message}`);
    if (error.stack) {
      core.debug(`Error stack trace: ${error.stack}`);
    }
  }

  core.info("🏁 PR Description Validator Action finished");
}

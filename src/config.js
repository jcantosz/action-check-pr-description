import YAML from "yaml";
import fs from "fs";
import path from "path";
import * as core from "@actions/core";

/**
 * Loads validation configuration from PR template file, external config,
 * and as a last resort from PR body front matter
 * @param {string} prBody - The pull request description body
 * @returns {Object} Validation configuration object
 * @throws {Error} If config cannot be loaded or parsed
 */
function loadValidationConfig(prBody) {
  core.info("🔍 Loading validation configuration...");

  // First, try to get validation from the PR template file
  const templatePath = core.getInput("template_path") || ".github/PULL_REQUEST_TEMPLATE.md";
  try {
    core.info(`📝 Checking PR template file at: ${templatePath}`);
    if (fs.existsSync(templatePath)) {
      const templateContent = fs.readFileSync(templatePath, "utf8");
      const templateFrontMatterMatch = templateContent.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

      if (templateFrontMatterMatch) {
        core.info("📄 Found front matter in PR template file, using this configuration");
        core.debug(`Template front matter length: ${templateFrontMatterMatch[1].length} characters`);

        const frontMatterContent = templateFrontMatterMatch[1];
        try {
          const frontMatter = YAML.parse(frontMatterContent);

          if (frontMatter && frontMatter.validation) {
            core.info("✅ Successfully loaded validation config from PR template");
            core.debug(`Loaded config: ${JSON.stringify(frontMatter.validation, null, 2)}`);
            return frontMatter.validation;
          } else {
            core.warning("❌ PR template front matter found but missing 'validation' section");
          }
        } catch (error) {
          core.warning(`⚠️ Failed to parse YAML in PR template front matter: ${error.message}`);
        }
      } else {
        core.debug("No front matter found in PR template file");
      }
    } else {
      core.warning(`⚠️ PR template file not found at: ${templatePath}`);
    }
  } catch (error) {
    core.warning(`⚠️ Error reading PR template file: ${error.message}`);
  }

  // Second, try to get validation from external config file
  core.info("📄 Checking for external configuration file");

  // Check for custom config path from action input or environment variable
  const customConfigPath = core.getInput("config_path") || process.env.CUSTOM_CONFIG_PATH;
  let configPath;

  if (customConfigPath) {
    configPath = customConfigPath;
    core.info(`🔍 Using custom config path: ${configPath}`);
  } else {
    configPath = path.join(__dirname, "..", "pr-validation-config.yml");
    core.info(`🔍 Using default config path: ${configPath}`);
  }

  try {
    core.debug(`Reading config file from: ${configPath}`);
    if (fs.existsSync(configPath)) {
      const configContents = fs.readFileSync(configPath, "utf8");

      if (configContents.trim()) {
        // Using yaml package instead of js-yaml
        const config = YAML.parse(configContents);
        if (config) {
          core.info(`✅ Successfully loaded validation config from ${configPath}`);
          core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);
          return config;
        } else {
          core.warning("❌ Config file parsed but resulted in empty configuration");
        }
      } else {
        core.warning("❌ Config file exists but is empty");
      }
    } else {
      core.warning(`⚠️ Config file not found at: ${configPath}`);
    }
  } catch (error) {
    core.warning(`⚠️ Error reading external config file: ${error.message}`);
  }

  // Finally, try to get validation from PR body front matter as a last resort
  core.info("📄 Checking PR body for front matter as last resort");
  const frontMatterMatch = prBody.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (frontMatterMatch) {
    core.info("📄 Found front matter in PR description");
    core.debug(`Front matter content length: ${frontMatterMatch[1].length} characters`);

    const frontMatterContent = frontMatterMatch[1];

    try {
      // Using yaml package instead of js-yaml
      const frontMatter = YAML.parse(frontMatterContent);

      if (!frontMatter || !frontMatter.validation) {
        core.warning("❌ Front matter found but missing 'validation' section");
        throw new Error("Missing validation configuration in front matter");
      }

      core.info("✅ Successfully loaded validation config from PR description");
      core.debug(`Loaded config: ${JSON.stringify(frontMatter.validation, null, 2)}`);
      return frontMatter.validation;
    } catch (error) {
      core.error(`❌ Failed to parse YAML in PR front matter: ${error.message}`);
      throw new Error(`Invalid YAML in PR description front matter: ${error.message}`);
    }
  }

  // If we reach here, we couldn't find any valid configuration
  core.error("❌ No valid validation configuration found in any source");
  throw new Error("No valid validation configuration found");
}

export { loadValidationConfig };

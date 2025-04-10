import YAML from "yaml";
import fs from "fs";
import path from "path";
import * as core from "@actions/core";

/**
 * Loads validation configuration from PR template file, falling back to PR body front matter
 * or external config file if template validation is not found
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

  // If we get here, either the template file wasn't found or didn't have valid front matter
  // Fallback to PR description front matter
  const frontMatterMatch = prBody.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (frontMatterMatch) {
    core.info("📄 Found front matter in PR description, using embedded configuration");
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

  core.info("📄 No front matter found in PR description, looking for external config file");

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
    const configContents = fs.readFileSync(configPath, "utf8");

    if (!configContents.trim()) {
      core.error("❌ Config file exists but is empty");
      throw new Error("Empty configuration file");
    }

    // Using yaml package instead of js-yaml
    const config = YAML.parse(configContents);
    if (!config) {
      core.error("❌ Config file parsed but resulted in empty configuration");
      throw new Error("Empty configuration file");
    }

    core.info(`✅ Successfully loaded validation config from ${configPath}`);
    core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);

    return config;
  } catch (error) {
    core.error(`❌ Failed to load external config: ${error.message}`);
    throw new Error(`Failed to load external configuration: ${error.message}`);
  }
}

export { loadValidationConfig };

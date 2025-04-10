import YAML from "yaml";
import fs from "fs";
import path from "path";
import * as core from "@actions/core";

/**
 * Loads validation configuration from PR body front matter or external config file
 * @param {string} prBody - The pull request description body
 * @returns {Object} Validation configuration object
 * @throws {Error} If config cannot be loaded or parsed
 */
function loadValidationConfig(prBody) {
  core.info("🔍 Loading validation configuration...");

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

  // Check for custom config path from action environment variable
  const customConfigPath = process.env.CUSTOM_CONFIG_PATH;
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

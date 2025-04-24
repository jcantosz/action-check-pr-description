import YAML from "yaml";
import fs from "fs";
import path from "path";
import * as core from "@actions/core";

/**
 * Extract frontmatter content from text containing frontmatter
 * @param {string} content - Text that may contain frontmatter
 * @returns {string|null} Extracted frontmatter content or null if not found
 */
function extractFrontMatter(content) {
  const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!frontMatterMatch) {
    return null;
  }
  return frontMatterMatch[1];
}

/**
 * Parse YAML content and extract validation configuration
 * @param {string} content - YAML content to parse
 * @param {boolean} isFrontMatter - Whether the content is from frontmatter (needs validation key)
 * @returns {Object|null} Extracted validation configuration or null if invalid
 */
function parseValidationConfig(content, isFrontMatter = false) {
  try {
    const parsed = YAML.parse(content);

    if (!parsed) {
      return null;
    }

    if (isFrontMatter) {
      return parsed.validation || null;
    }

    return parsed;
  } catch (error) {
    core.warning(`⚠️ Failed to parse YAML: ${error.message}`);
    return null;
  }
}

/**
 * Load configuration from a markdown file with frontmatter
 * @param {string} filePath - Path to the markdown file
 * @returns {Object|null} Validation configuration or null if not found/invalid
 */
function loadConfigFromMarkdown(filePath) {
  core.info(`📄 Processing Markdown file with frontmatter: ${filePath}`);

  try {
    const fileContents = fs.readFileSync(filePath, "utf8");
    const frontMatterContent = extractFrontMatter(fileContents);

    if (!frontMatterContent) {
      core.warning(`❌ No frontmatter found in markdown file: ${filePath}`);
      return null;
    }

    core.info("📄 Found front matter in configuration file");
    const config = parseValidationConfig(frontMatterContent, true);

    if (!config) {
      core.warning("❌ Frontmatter found but missing 'validation' section or invalid YAML");
      return null;
    }

    core.info("✅ Successfully loaded validation config from markdown frontmatter");
    core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);
    return config;
  } catch (error) {
    core.warning(`⚠️ Error processing markdown file: ${error.message}`);
    return null;
  }
}

/**
 * Load configuration from a YAML file
 * @param {string} filePath - Path to the YAML file
 * @returns {Object|null} Validation configuration or null if not found/invalid
 */
function loadConfigFromYaml(filePath) {
  core.info(`📄 Processing YAML configuration file: ${filePath}`);

  try {
    const fileContents = fs.readFileSync(filePath, "utf8");

    if (!fileContents.trim()) {
      core.warning("❌ Config file exists but is empty");
      return null;
    }

    const config = parseValidationConfig(fileContents);

    if (!config) {
      core.warning("❌ Config file parsed but resulted in empty configuration");
      return null;
    }

    core.info("✅ Successfully loaded validation config from YAML file");
    core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);
    return config;
  } catch (error) {
    core.warning(`⚠️ Failed to parse YAML file: ${error.message}`);
    return null;
  }
}

/**
 * Load configuration from PR body frontmatter
 * @param {string} prBody - The pull request description body
 * @returns {Object|null} Validation configuration or null if not found/invalid
 */
function loadConfigFromPrBody(prBody) {
  core.info("📄 Checking PR body for front matter");

  const frontMatterContent = extractFrontMatter(prBody);

  if (!frontMatterContent) {
    core.debug("No frontmatter found in PR body");
    return null;
  }

  core.info("📄 Found front matter in PR description");
  core.debug(`Front matter content length: ${frontMatterContent.length} characters`);

  const config = parseValidationConfig(frontMatterContent, true);

  if (!config) {
    core.warning("❌ PR frontmatter found but missing 'validation' section or invalid YAML");
    return null;
  }

  core.info("✅ Successfully loaded validation config from PR description");
  core.debug(`Loaded config: ${JSON.stringify(config, null, 2)}`);
  return config;
}

/**
 * Determine the appropriate loader function based on file extension
 * @param {string} filePath - Path to the configuration file
 * @returns {Function|null} Loader function or null if unsupported extension
 */
function getConfigLoaderForFile(filePath) {
  const fileExtension = path.extname(filePath).toLowerCase();

  if ([".md", ".markdown"].includes(fileExtension)) {
    return loadConfigFromMarkdown;
  } else if ([".yml", ".yaml"].includes(fileExtension)) {
    return loadConfigFromYaml;
  }

  core.warning(`⚠️ Unsupported file extension for config file: ${fileExtension}`);
  return null;
}

/**
 * Check if file exists (case insensitive)
 * @param {string} filePath - Path to check
 * @returns {string|null} Actual path with correct casing if found, null otherwise
 */
function findFileIgnoreCase(filePath) {
  try {
    // Check direct existence first (fastest path)
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    // If directory doesn't exist, file can't exist
    if (!fs.existsSync(dir)) {
      return null;
    }

    // Look for case-insensitive match
    const files = fs.readdirSync(dir);
    const matchingFile = files.find((f) => f.toLowerCase() === basename.toLowerCase());

    if (matchingFile) {
      return path.join(dir, matchingFile);
    }

    return null;
  } catch (error) {
    core.debug(`Error checking for file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Get list of possible template file locations
 * @returns {Array<string>} List of template file paths to check
 */
function getTemplatePaths() {
  return [
    "./pull_request_template.md",
    "./.github/pull_request_template.md",
    "./docs/pull_request_template.md",
    "./.github/PULL_REQUEST_TEMPLATE/pull_request_template.md",
    "./docs/PULL_REQUEST_TEMPLATE/pull_request_template.md",
  ];
}

/**
 * Loads validation configuration from specified file or PR body frontmatter as last resort
 * @param {string} prBody - The pull request description body
 * @returns {Object} Validation configuration object
 * @throws {Error} If config cannot be loaded or parsed
 */
function loadValidationConfig(prBody) {
  core.info("🔍 Loading validation configuration...");
  let configFilePath = null;

  // 1. Use the config file if specified via input
  const configFileInput = core.getInput("config_file");
  if (configFileInput) {
    core.info(`📝 Checking specified configuration file: ${configFileInput}`);
    configFilePath = findFileIgnoreCase(configFileInput);

    if (!configFilePath) {
      core.warning(`⚠️ Specified config file not found: ${configFileInput}`);
    }
  }

  // 2. If no config file specified or not found, try default locations
  if (!configFilePath) {
    core.info("📝 Looking for PR template in default locations (case insensitive):");

    const templatePaths = getTemplatePaths();
    for (const templatePath of templatePaths) {
      core.info(`  - Checking ${templatePath}`);
      configFilePath = findFileIgnoreCase(templatePath);

      if (configFilePath) {
        core.info(`✅ Found PR template at: ${configFilePath}`);
        break;
      }
    }

    if (!configFilePath) {
      core.warning("⚠️ No PR template found in any of the default locations");
    }
  }

  // Try to load config from found file
  if (configFilePath) {
    const configLoader = getConfigLoaderForFile(configFilePath);

    if (configLoader) {
      const config = configLoader(configFilePath);
      if (config) {
        core.info(`✅ Successfully loaded validation config from ${configFilePath}`);
        return config;
      } else {
        core.warning(`⚠️ Failed to extract valid configuration from ${configFilePath}`);
      }
    }
  }

  // 3. If all else fails, try to read frontmatter from PR body
  core.info("📄 No valid configuration found in files, checking PR body frontmatter as last resort");
  const prBodyConfig = loadConfigFromPrBody(prBody);
  if (prBodyConfig) {
    core.info("✅ Successfully loaded validation config from PR body frontmatter");
    return prBodyConfig;
  }

  // If we reach here, we couldn't find any valid configuration
  core.error("❌ No valid validation configuration found in any source");
  core.error("Checked the following locations:");
  if (configFileInput) {
    core.error(`  - Specified config_file: ${configFileInput}`);
  }
  getTemplatePaths().forEach((p) => core.error(`  - ${p}`));
  core.error("  - PR body frontmatter");

  throw new Error("No valid validation configuration found");
}

export {
  loadValidationConfig,
  extractFrontMatter,
  parseValidationConfig,
  loadConfigFromMarkdown,
  loadConfigFromYaml,
  loadConfigFromPrBody,
  getConfigLoaderForFile,
  findFileIgnoreCase,
  getTemplatePaths,
};

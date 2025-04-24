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
  // Try to match frontmatter directly in the document
  let frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);

  if (!frontMatterMatch) {
    // If not found directly, try to find it inside an HTML comment
    frontMatterMatch = content.match(/<!--\s*\n?---\s*\n([\s\S]*?)\n---\s*\n?-->/);

    if (!frontMatterMatch) {
      // As a last resort, try to find any --- block inside HTML comments
      frontMatterMatch = content.match(/<!--[\s\S]*?---\s*\n([\s\S]*?)\n---[\s\S]*?-->/);
    }
  }

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
 * Fetches file content from GitHub repository
 * @param {Object} github - GitHub API client
 * @param {Object} context - GitHub Actions context
 * @param {string} filePath - Path to the file within the repo
 * @param {string} [branch=null] - Branch to fetch from or null for default branch
 * @returns {Promise<string|null>} File content or null if not found
 */
async function fetchFileFromGitHub(github, context, filePath, branch = null) {
  const { owner, repo } = context.repo;
  const ref = branch || context.ref;

  core.debug(`Fetching file from GitHub: ${filePath} (branch: ${ref})`);

  try {
    const response = await github.request("GET /repos/{owner}/{repo}/contents/{path}", {
      owner,
      repo,
      path: filePath,
      ref: ref,
    });

    if (response.status !== 200) {
      core.warning(`Failed to fetch ${filePath} from branch ${ref}. Status: ${response.status}`);
      return null;
    }

    // Content is Base64 encoded
    const content = Buffer.from(response.data.content, "base64").toString("utf8");
    core.debug(`Successfully fetched ${filePath} from branch ${ref} (${content.length} bytes)`);
    return content;
  } catch (error) {
    core.warning(`Error fetching ${filePath} from branch ${ref}: ${error.message}`);
    return null;
  }
}

/**
 * Load configuration from a markdown file with frontmatter
 * @param {string} filePath - Path to the markdown file
 * @param {Object} [github=null] - GitHub API client for remote fetching
 * @param {Object} [context=null] - GitHub Actions context for remote fetching
 * @returns {Object|null} Validation configuration or null if not found/invalid
 */
async function loadConfigFromMarkdown(filePath, github = null, context = null) {
  core.info(`📄 Processing Markdown file with frontmatter: ${filePath}`);

  let fileContents;
  const configBranch = process.env.CONFIG_BRANCH;

  // Try to fetch from GitHub if branch specified and GitHub client provided
  if (configBranch && github && context) {
    core.info(`Attempting to fetch ${filePath} from branch: ${configBranch}`);
    fileContents = await fetchFileFromGitHub(github, context, filePath, configBranch);

    if (!fileContents) {
      core.warning(`Could not fetch file from specified branch. Falling back to local file.`);
    }
  }

  // Fall back to local file if remote fetch failed or wasn't requested
  if (!fileContents) {
    try {
      fileContents = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      core.warning(`⚠️ Error reading markdown file: ${error.message}`);
      return null;
    }
  }

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
}

/**
 * Load configuration from a YAML file
 * @param {string} filePath - Path to the YAML file
 * @param {Object} [github=null] - GitHub API client for remote fetching
 * @param {Object} [context=null] - GitHub Actions context for remote fetching
 * @returns {Object|null} Validation configuration or null if not found/invalid
 */
async function loadConfigFromYaml(filePath, github = null, context = null) {
  core.info(`📄 Processing YAML configuration file: ${filePath}`);

  let fileContents;
  const configBranch = process.env.CONFIG_BRANCH;

  // Try to fetch from GitHub if branch specified and GitHub client provided
  if (configBranch && github && context) {
    core.info(`Attempting to fetch ${filePath} from branch: ${configBranch}`);
    fileContents = await fetchFileFromGitHub(github, context, filePath, configBranch);

    if (!fileContents) {
      core.warning(`Could not fetch file from specified branch. Falling back to local file.`);
    }
  }

  // Fall back to local file if remote fetch failed or wasn't requested
  if (!fileContents) {
    try {
      fileContents = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      core.warning(`⚠️ Error reading YAML file: ${error.message}`);
      return null;
    }
  }

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
 * Check if file exists locally (case insensitive)
 * @param {string} filePath - Path to check
 * @returns {string|null} Actual path with correct casing if found, null otherwise
 */
function findLocalFileIgnoreCase(filePath) {
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
 * @param {Object} [github=null] - GitHub API client
 * @param {Object} [context=null] - GitHub Actions context
 * @returns {Promise<Object>} Validation configuration object
 * @throws {Error} If config cannot be loaded or parsed
 */
async function loadValidationConfig(prBody, github = null, context = null) {
  core.info("🔍 Loading validation configuration...");
  let configFilePath = null;
  let loadedConfig = null;

  // 1. Use the config file if specified via input
  const configFileInput = core.getInput("config_file");

  // Check for specific branch config
  const configBranch = process.env.CONFIG_BRANCH || null;

  if (configBranch) {
    core.info(`🌿 Using configuration from branch: ${configBranch}`);
  }

  if (configFileInput) {
    core.info(`📝 Checking specified configuration file: ${configFileInput}`);

    // If we're using a remote branch, we don't need to check if the file exists locally
    if (configBranch && github && context) {
      configFilePath = configFileInput; // We'll try to fetch it later
    } else {
      configFilePath = findLocalFileIgnoreCase(configFileInput);

      if (!configFilePath) {
        core.warning(`⚠️ Specified config file not found locally: ${configFileInput}`);
      }
    }
  }

  // 2. If no config file specified or not found, try default locations
  if (!configFilePath) {
    core.info("📝 Looking for PR template in default locations:");

    const templatePaths = getTemplatePaths();

    // If using a remote branch, we'll try to fetch from it
    if (configBranch && github && context) {
      // Just use the first template path for now - we'll try to fetch it
      configFilePath = templatePaths[0];
      core.info(`Will attempt to fetch template from branch ${configBranch}`);
    }
    // Otherwise look for local files
    else {
      for (const templatePath of templatePaths) {
        core.info(`  - Checking ${templatePath}`);
        configFilePath = findLocalFileIgnoreCase(templatePath);

        if (configFilePath) {
          core.info(`✅ Found PR template at: ${configFilePath}`);
          break;
        }
      }

      if (!configFilePath) {
        core.warning("⚠️ No PR template found in any of the default locations");
      }
    }
  }

  // Try to load config from found file path
  if (configFilePath) {
    const configLoader = getConfigLoaderForFile(configFilePath);

    if (configLoader) {
      loadedConfig = await configLoader(configFilePath, github, context);
      if (loadedConfig) {
        core.info(`✅ Successfully loaded validation config from ${configFilePath}`);
        core.debug(`Loaded validation config: ${JSON.stringify(loadedConfig, null, 2)}`);
        return loadedConfig;
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
    core.error(`  - Specified config_file: ${configFileInput}${configBranch ? ` (branch: ${configBranch})` : ""}`);
  }
  getTemplatePaths().forEach((p) => core.error(`  - ${p}${configBranch ? ` (branch: ${configBranch})` : ""}`));
  core.error("  - PR body frontmatter");

  // Return an empty configuration instead of throwing an error
  // This way, if no config is found, no validation will be performed
  core.info("⚠️ Using empty configuration - no validations will be performed");
  return {};
}

export {
  loadValidationConfig,
  extractFrontMatter,
  parseValidationConfig,
  loadConfigFromMarkdown,
  loadConfigFromYaml,
  loadConfigFromPrBody,
  getConfigLoaderForFile,
  findLocalFileIgnoreCase,
  getTemplatePaths,
  fetchFileFromGitHub,
};

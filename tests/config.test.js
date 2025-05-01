import { loadValidationConfig } from "../src/config.js";
import fs from "fs";
import path from "path";
import YAML from "yaml";

// Mock core and fs modules
jest.mock("@actions/core");
jest.mock("fs");
jest.mock("path");

// Mock the core module
import * as core from "@actions/core";

// Create mock for GitHub fetching
const mockFetchFileFromGitHub = jest.fn();
jest.mock("../src/config.js", () => {
  const originalModule = jest.requireActual("../src/config.js");
  return {
    ...originalModule,
    fetchFileFromGitHub: (...args) => mockFetchFileFromGitHub(...args),
  };
});

describe("Configuration Loading", () => {
  const mockGithub = { request: jest.fn() };
  const mockContext = { repo: { owner: "test", repo: "test-repo" } };

  beforeEach(() => {
    jest.resetAllMocks();
    mockFetchFileFromGitHub.mockReset();

    path.join.mockImplementation((...parts) => parts.join("/"));
    path.extname.mockImplementation((filePath) => {
      if (typeof filePath !== "string") return "";
      if (filePath.endsWith(".yml")) return ".yml";
      if (filePath.endsWith(".yaml")) return ".yaml";
      if (filePath.endsWith(".md")) return ".md";
      return "";
    });
    path.dirname.mockImplementation((filePath) => {
      if (!filePath) return ".";
      const parts = filePath.split("/");
      parts.pop();
      return parts.length ? parts.join("/") : ".";
    });
    path.basename.mockImplementation((filePath) => {
      if (!filePath) return "";
      const parts = filePath.split("/");
      return parts[parts.length - 1];
    });

    fs.readFileSync.mockImplementation(() => "issue_number: required");
    core.getInput.mockImplementation((name) => {
      if (name === "config_file") return ".github/pr-validation-config.yml";
      return "";
    });

    // Clear any environment variables
    if (process.env.CUSTOM_CONFIG_PATH) {
      delete process.env.CUSTOM_CONFIG_PATH;
    }
    if (process.env.CONFIG_BRANCH) {
      delete process.env.CONFIG_BRANCH;
    }

    // Mock fs.existsSync to make findLocalFileIgnoreCase work
    fs.existsSync.mockImplementation(() => true);
    // Mock fs.readdirSync for directory checks
    fs.readdirSync.mockImplementation(() => []);
  });

  test("loads config from PR front matter as last resort", async () => {
    // Make file loading fail to force falling back to PR body
    fs.existsSync.mockImplementation(() => false);
    fs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    const prBody = `---
validation:
  issue_number: required
  require_labels: true
  require_assignees: 2
---
PR content`;

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config.issue_number).toBe("required");
    expect(config.require_labels).toBe(true);
    expect(config.require_assignees).toBe(2);
  });

  test("loads config from local file when specified", async () => {
    const configData = `
issue_number: required
require_labels: true
require_reviewers: 2
`;
    fs.readFileSync.mockReturnValueOnce(configData);
    fs.existsSync.mockImplementation(() => true);

    const prBody = "PR content without front matter";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config.issue_number).toBe("required");
    expect(config.require_labels).toBe(true);
    expect(config.require_reviewers).toBe(2);
    expect(fs.readFileSync).toHaveBeenCalledWith(".github/pr-validation-config.yml", "utf8");
  });

  test("loads config from specified branch when available", async () => {
    process.env.CONFIG_BRANCH = "main";

    // Make local file loading fail
    fs.existsSync.mockImplementation(() => false);
    fs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    // Mock the GitHub API response
    mockFetchFileFromGitHub.mockResolvedValueOnce(`
issue_number: required
require_labels: true
require_assignees: 3
`);

    const prBody = "PR content without front matter";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config.issue_number).toBe("required");
    expect(config.require_labels).toBe(true);
    expect(config.require_assignees).toBe(3);
    expect(mockFetchFileFromGitHub).toHaveBeenCalledWith(
      mockGithub,
      mockContext,
      ".github/pr-validation-config.yml",
      "main"
    );
  });

  test("falls back to template on specified branch", async () => {
    process.env.CONFIG_BRANCH = "main";
    core.getInput.mockReturnValue(""); // No user-specified config file

    // Make local file loading fail
    fs.existsSync.mockImplementation(() => false);

    // Mock the GitHub API response for the template path
    mockFetchFileFromGitHub.mockImplementation((github, context, filePath) => {
      if (filePath === "./.github/pull_request_template.md") {
        return Promise.resolve(`<!--
---
validation:
  issue_number: required
  require_reviewers: 4
---
-->

PR Template`);
      }
      return Promise.resolve(null);
    });

    const prBody = "PR content without front matter";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config.issue_number).toBe("required");
    expect(config.require_reviewers).toBe(4);
  });

  test("falls back to local template when branch template not found", async () => {
    process.env.CONFIG_BRANCH = "main";
    core.getInput.mockReturnValue(""); // No user-specified config file

    // Make GitHub API call fail
    mockFetchFileFromGitHub.mockResolvedValue(null);

    // Set up local template
    fs.existsSync.mockImplementation((path) => {
      return path.includes("pull_request_template.md");
    });
    fs.readFileSync.mockImplementation((path) => {
      if (path.includes("pull_request_template.md")) {
        return `<!--
---
validation:
  issue_number: required
  require_labels: true
  require_assignees: 1
---
-->

PR Template`;
      }
      throw new Error("File not found");
    });

    const prBody = "PR content without front matter";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config.issue_number).toBe("required");
    expect(config.require_labels).toBe(true);
    expect(config.require_assignees).toBe(1);
  });

  test("returns empty config when no valid configuration found", async () => {
    // Make all file loading fail
    fs.existsSync.mockImplementation(() => false);
    fs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });
    mockFetchFileFromGitHub.mockResolvedValue(null);

    const prBody = "PR content without any valid configuration";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config).toEqual({});
  });

  test("handles invalid YAML gracefully", async () => {
    // Using the yaml package's specific syntax error
    const originalParse = YAML.parse;
    YAML.parse = jest.fn().mockImplementation(() => {
      throw new Error("Invalid YAML syntax");
    });

    fs.readFileSync.mockReturnValueOnce("invalid: yaml: :");

    const prBody = "No front matter";

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);
    expect(config).toEqual({});

    // Restore the original function
    YAML.parse = originalParse;
  });

  test("follows priority order of config sources", async () => {
    process.env.CONFIG_BRANCH = "main";

    // Make sure we check the priority order by having conflicting configs

    // 1. Branch config (highest priority) - should win
    mockFetchFileFromGitHub.mockImplementation((github, context, filePath, branch) => {
      if (filePath === ".github/pr-validation-config.yml" && branch === "main") {
        return Promise.resolve("issue_number: required\nrequire_assignees: 1");
      }
      return Promise.resolve(null);
    });

    // 2. Local file config (medium priority) - should not be used
    fs.readFileSync.mockImplementation((path) => {
      if (path === ".github/pr-validation-config.yml") {
        return "issue_number: optional\nrequire_assignees: 2";
      }
      throw new Error("File not found");
    });

    // 3. PR body (lowest priority) - should not be used
    const prBody = `---
validation:
  issue_number: skipped
  require_assignees: 3
---
Content`;

    const config = await loadValidationConfig(prBody, mockGithub, mockContext);

    // Should use the config from the branch config file (highest priority)
    expect(config.issue_number).toBe("required");
    expect(config.require_assignees).toBe(1);

    // Verify that fetchFileFromGitHub was called correctly
    expect(mockFetchFileFromGitHub).toHaveBeenCalledWith(
      mockGithub,
      mockContext,
      ".github/pr-validation-config.yml",
      "main"
    );
  });
});

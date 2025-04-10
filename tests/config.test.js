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

describe("Configuration Loading", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    path.join.mockImplementation((...parts) => parts.join("/"));
    fs.readFileSync.mockImplementation(() => "issue_number: required");

    // Clear any environment variables
    if (process.env.CUSTOM_CONFIG_PATH) {
      delete process.env.CUSTOM_CONFIG_PATH;
    }
  });

  test("loads config from PR front matter", () => {
    const prBody = `---
validation:
  issue_number: required
  require_labels: true
---
PR content`;

    const config = loadValidationConfig(prBody);
    expect(config.issue_number).toBe("required");
    expect(config.require_labels).toBe(true);
  });

  test("throws error on invalid YAML", () => {
    // Using the yaml package's specific syntax error
    const originalParse = YAML.parse;
    YAML.parse = jest.fn().mockImplementation(() => {
      throw new Error("Invalid YAML syntax");
    });

    const prBody = `---
validation:
  issue_number: "unclosed quote
---`;

    expect(() => loadValidationConfig(prBody)).toThrow(/Invalid YAML/);

    // Restore the original function
    YAML.parse = originalParse;
  });

  test("loads config from external file when no front matter", () => {
    const prBody = "PR content without front matter";

    // Create a valid non-empty YAML string
    fs.readFileSync.mockReturnValueOnce("issue_number: required");

    const config = loadValidationConfig(prBody);
    expect(config.issue_number).toBe("required");
  });

  test("throws error when front matter is missing validation section", () => {
    const prBody = `---
title: My PR
---
Content`;

    expect(() => loadValidationConfig(prBody)).toThrow(/Missing validation/);
  });

  test("throws error when external config file is not found", () => {
    const prBody = "No front matter";
    fs.readFileSync.mockImplementationOnce(() => {
      throw new Error("File not found");
    });

    expect(() => loadValidationConfig(prBody)).toThrow(/Failed to load external configuration/);
  });

  test("throws error when external config file contains empty config", () => {
    const prBody = "No front matter";
    fs.readFileSync.mockReturnValueOnce("");

    expect(() => loadValidationConfig(prBody)).toThrow(/Empty configuration file/);
  });

  test("respects custom config path from environment variable", () => {
    process.env.CUSTOM_CONFIG_PATH = "custom/path/config.yml";

    const prBody = "No front matter";

    // Create a valid YAML string for the custom path
    fs.readFileSync.mockImplementationOnce((path) => {
      if (path === "custom/path/config.yml") {
        return "issue_number: optional";
      }
      throw new Error("Wrong path");
    });

    const config = loadValidationConfig(prBody);
    expect(config.issue_number).toBe("optional");
    expect(fs.readFileSync).toHaveBeenCalledWith("custom/path/config.yml", "utf8");

    // Clean up
    delete process.env.CUSTOM_CONFIG_PATH;
  });
});

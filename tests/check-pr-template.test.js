import * as core from "@actions/core";
import {
  validatePullRequest,
  validateLabels,
  validateIssueReference,
  getSectionContent,
} from "../src/check-pr-template.js";

jest.mock("@actions/core");

describe("PR Template Validation", () => {
  let mockContext;
  let mockGithub;

  beforeEach(() => {
    jest.resetAllMocks();
    mockContext = {
      repo: { owner: "test", repo: "repo" },
      payload: {
        pull_request: {
          body: "",
          number: 1,
          labels: [],
        },
      },
    };

    // Update to use direct request method
    mockGithub = {
      request: jest.fn().mockResolvedValue({ data: [] }),
    };

    core.setFailed.mockImplementation((msg) => {
      throw new Error(msg);
    });

    core.info = jest.fn();
    core.debug = jest.fn();
  });

  test("validates labels when required", async () => {
    mockContext.payload.pull_request.body = `---
validation:
  require_labels: true
---
Content`;

    await expect(async () => {
      await validatePullRequest({ github: mockGithub, context: mockContext });
    }).rejects.toThrow("label must be applied");
  });

  test("validates issue reference when required", async () => {
    mockContext.payload.pull_request.body = `---
validation:
  issue_number: required
---
Content`;

    await expect(async () => {
      await validatePullRequest({ github: mockGithub, context: mockContext });
    }).rejects.toThrow(/Required issue reference is missing/);
  });

  test("validates section presence", async () => {
    mockContext.payload.pull_request.body = `---
validation:
  sections:
    "Missing Section":
      rule: any_checked
---
Content`;

    await expect(async () => {
      await validatePullRequest({ github: mockGithub, context: mockContext });
    }).rejects.toThrow("not found in PR description");
  });

  test("passes validation when all requirements are met", async () => {
    mockContext.payload.pull_request.body = `---
validation:
  require_labels: false
  issue_number: false
  sections: {}
---
Content`;

    const result = await validatePullRequest({ github: mockGithub, context: mockContext });
    expect(result).toBe(true);
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(expect.stringMatching(/successfully/));
  });

  test("fails when context has no pull request", async () => {
    const contextWithoutPR = {
      repo: { owner: "test", repo: "repo" },
      payload: {},
    };

    await expect(async () => {
      await validatePullRequest({ github: mockGithub, context: contextWithoutPR });
    }).rejects.toThrow("only be run on pull request");
  });

  test("handles semantic commit validation", async () => {
    mockContext.payload.pull_request.body = `---
validation:
  semantic_commits:
    enabled: true
    types: ['feat', 'fix']
---
Content`;

    // Update to use direct request method
    mockGithub.request.mockResolvedValueOnce({
      data: [
        {
          sha: "abc123",
          commit: { message: "invalid commit message" },
        },
      ],
    });

    await expect(async () => {
      await validatePullRequest({ github: mockGithub, context: mockContext });
    }).rejects.toThrow(/commits do not follow the semantic/);
  });

  test("validateLabels passes with labels", () => {
    const pr = { labels: [{ name: "bug" }] };
    const errors = [];
    validateLabels(pr, errors);
    expect(errors).toHaveLength(0);
  });

  test("validateLabels fails without labels", () => {
    const pr = { labels: [] };
    const errors = [];
    validateLabels(pr, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/At least one label/);
  });

  test("validateIssueReference passes with valid issue reference", () => {
    const prBody = "This PR\n\nFixes: #123\n\nOther content";
    const errors = [];
    validateIssueReference(prBody, errors);
    expect(errors).toHaveLength(0);
  });

  test("validateIssueReference accepts all GitHub issue linking keywords", () => {
    const formats = [
      // Standard format with colon
      "close: #123",
      "closes: #456",
      "closed: #789",
      "fix: #101",
      "fixes: #202",
      "fixed: #303",
      "resolve: #404",
      "resolves: #505",
      "resolved: #606",

      // Without colon
      "close #123",
      "closes #456",
      "fix #101",
      "resolves #505",

      // Case variations
      "FIX: #123",
      "Closes: #456",
      "RESOLVED: #789",

      // Cross-repository references
      "Fixes octo-org/octo-repo#100",
      "Resolves username/repo-name#99",
      "closes owner/project-repo#12",

      // Various spacing
      "Fixes:#123",
      "Fixes:    #456",
      "Closes:  octo-org/octo-repo#100",
    ];

    for (const format of formats) {
      const errors = [];
      validateIssueReference(format, errors);
      expect(errors).toHaveLength(0);
    }
  });

  test("validateIssueReference fails with invalid or missing issue references", () => {
    const invalidFormats = [
      "No issue reference here",
      "Almost fixes #",
      "fixed repo#123", // missing slash
      "resolving #123", // not a valid keyword
      "fix ##123", // double hash
      "Issue #123", // 'Issue' is not a linking keyword
      "#123", // missing keyword
      "closes issue #123", // extra 'issue' word
    ];

    for (const format of invalidFormats) {
      const errors = [];
      validateIssueReference(format, errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/Required issue reference/);
    }
  });

  test("validateIssueReference accepts alternative formats", () => {
    const formats = [
      "Closes: #456",
      "Resolves: #789",
      "fixes: #123", // Case insensitive
      "CLOSES: #456",
    ];

    for (const format of formats) {
      const errors = [];
      validateIssueReference(format, errors);
      expect(errors).toHaveLength(0);
    }
  });

  test("getSectionContent extracts section correctly", () => {
    const prBody = `
# Title

### Section A
Content of section A
with multiple lines

### Section B
Content of section B

### Final Section
The end
`;

    expect(getSectionContent(prBody, "Section A")).toBe("Content of section A\nwith multiple lines");
    expect(getSectionContent(prBody, "Section B")).toBe("Content of section B");
    expect(getSectionContent(prBody, "Final Section")).toBe("The end");
    expect(getSectionContent(prBody, "Non-existent Section")).toBe("");
  });

  test("getSectionContent handles special regex characters in section names", () => {
    const prBody = `
### Section (with parentheses)
Content here

### Section [with brackets]
More content
`;

    expect(getSectionContent(prBody, "Section (with parentheses)")).toBe("Content here");
    expect(getSectionContent(prBody, "Section [with brackets]")).toBe("More content");
  });
});

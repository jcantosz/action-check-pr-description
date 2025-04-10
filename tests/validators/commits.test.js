import { validateCommitMessage, getCommits, validateSemanticCommits } from "../../src/validators/commits.js";
import { ValidationResult } from "../../src/types.js";

// Mock the ValidationResult class
jest.mock("../../src/types.js", () => ({
  ValidationResult: class MockValidationResult {
    constructor(isValid, error = null) {
      this.isValid = isValid;
      this.error = error;
    }
  },
}));

describe("Commit Message Validation", () => {
  const mockCommit = (message) => ({
    sha: "1234567890",
    commit: { message },
  });

  test("accepts valid semantic commit", () => {
    const commit = mockCommit("feat(ui): add new button component");
    const result = validateCommitMessage(commit, ["feat"], ["ui"]);
    expect(result.isValid).toBe(true);
  });

  test("rejects invalid commit type", () => {
    const commit = mockCommit("invalid: this is wrong");
    const result = validateCommitMessage(commit, ["feat", "fix"], null);
    expect(result.isValid).toBe(false);
    expect(result.error).toEqual({
      sha: expect.any(String),
      message: "invalid: this is wrong",
      error: expect.stringMatching(/Type "invalid" is not allowed/),
    });
  });

  test("accepts commit without scope when scopes not enforced", () => {
    const commit = mockCommit("feat: add new feature");
    const result = validateCommitMessage(commit, ["feat"], null);
    expect(result.isValid).toBe(true);
  });

  test("rejects invalid scope when scopes enforced", () => {
    const commit = mockCommit("feat(invalid): add new feature");
    const result = validateCommitMessage(commit, ["feat"], ["ui", "api"]);
    expect(result.isValid).toBe(false);
    expect(result.error).toEqual({
      sha: "1234567",
      message: "feat(invalid): add new feature",
      error: expect.stringMatching(/Scope "invalid" is not allowed/),
    });
  });

  test("rejects non-semantic commit format", () => {
    const commit = mockCommit("add something cool");
    const result = validateCommitMessage(commit, ["feat", "fix"], null);
    expect(result.isValid).toBe(false);
    expect(result.error.error).toMatch(/Does not follow semantic format/);
  });

  test("handles breaking change indicator", () => {
    const commit = mockCommit("feat!: breaking change");
    const result = validateCommitMessage(commit, ["feat"], null);
    expect(result.isValid).toBe(true);
  });
});

describe("Commit Collection and Validation", () => {
  let mockGithub;
  let mockContext;
  let mockCommits;

  beforeEach(() => {
    mockCommits = [mockCommit("feat: valid commit"), mockCommit("fix: another valid commit")];
    // Update mock to use direct request instead of REST plugin
    mockGithub = {
      request: jest.fn().mockResolvedValue({ data: mockCommits }),
    };
    mockContext = {
      repo: { owner: "test", repo: "repo" },
      payload: {
        pull_request: {
          number: 123,
        },
      },
    };
  });

  test("getCommits fetches from GitHub API", async () => {
    const commits = await getCommits(mockGithub, mockContext);
    expect(commits).toEqual(mockCommits);
    expect(mockGithub.request).toHaveBeenCalledWith("GET /repos/{owner}/{repo}/pulls/{pull_number}/commits", {
      owner: "test",
      repo: "repo",
      pull_number: 123,
    });
  });

  test("getCommits uses included commits if available", async () => {
    const includedCommits = [mockCommit("included commit")];
    const contextWithIncluded = {
      ...mockContext,
      payload: {
        pull_request: {
          number: 123,
          commits: 1,
          included_commits: includedCommits,
        },
      },
    };

    const commits = await getCommits(mockGithub, contextWithIncluded);
    expect(commits).toEqual(includedCommits);
    expect(mockGithub.request).not.toHaveBeenCalled();
  });

  test("validateSemanticCommits adds errors for invalid commits", async () => {
    mockCommits.push(mockCommit("invalid commit message"));
    const errors = [];

    await validateSemanticCommits(mockGithub, mockContext, { types: ["feat", "fix"] }, errors);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/The following commits do not follow/);
  });

  test("validateSemanticCommits handles API errors", async () => {
    // Update to match the new request method
    mockGithub.request.mockRejectedValueOnce(new Error("API error"));
    const errors = [];

    await validateSemanticCommits(mockGithub, mockContext, { types: ["feat", "fix"] }, errors);

    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/Failed to validate semantic commits/);
  });

  // Helper for mockCommit
  function mockCommit(message) {
    return {
      sha: "1234567890",
      commit: { message },
    };
  }
});

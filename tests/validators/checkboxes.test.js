import {
  parseCheckboxes,
  validateSection,
  findDirectChildren,
  validateNestedCheckboxes,
  validateSectionRules,
} from "../../src/validators/checkboxes.js";

describe("Checkbox Validation", () => {
  test("parses flat checkbox list", () => {
    const content = `
- [ ] Item 1
- [x] Item 2
- [ ] Item 3`;

    const result = parseCheckboxes(content);
    expect(result).toHaveLength(3);
    expect(result[1].checked).toBe(true);
  });

  test("validates any_checked rule", () => {
    const content = "- [ ] Unchecked item";
    const errors = [];

    validateSection("Test Section", { rule: "any_checked" }, content, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/at least one option must be checked/);
  });

  test("validates nested checkboxes", () => {
    const content = `
- [x] Parent
    - [ ] Child 1
    - [ ] Child 2`;

    const errors = [];
    validateSection(
      "Test Section",
      {
        rule: "any_checked",
        enforce_nested: true,
      },
      content,
      errors
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/has unchecked sub-items/);
  });

  test("handles empty content", () => {
    const result = parseCheckboxes("");
    expect(result).toHaveLength(0);
  });

  test("validates all_checked rule", () => {
    const content = `
- [x] Item 1
- [ ] Item 2`;
    const errors = [];

    validateSection("Test Section", { rule: "all_checked" }, content, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/all options must be checked/);
  });

  test("passes when all requirements are met", () => {
    const content = "- [x] Checked item";
    const errors = [];

    validateSection("Test Section", { rule: "any_checked" }, content, errors);
    expect(errors).toHaveLength(0);
  });

  test("handles null or undefined content", () => {
    const errors = [];
    validateSection("Test Section", { rule: "any_checked" }, null, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/empty or invalid/);
  });

  test("handles content with no checkboxes", () => {
    const content = "Just a paragraph with no checkboxes";
    const errors = [];
    validateSection("Test Section", { rule: "any_checked" }, content, errors);
    expect(errors).toHaveLength(0); // No checkboxes found, so no errors about checkboxes
  });

  test("correctly identifies multi-level indentation", () => {
    const content = `
- [x] Level 1
    - [x] Level 2
        - [x] Level 3
    - [x] Level 2 again
- [x] Another Level 1`;

    const checkboxes = parseCheckboxes(content);
    expect(checkboxes).toHaveLength(5);
    expect(checkboxes[0].indentation).toBe(0);
    expect(checkboxes[1].indentation).toBe(4);
    expect(checkboxes[2].indentation).toBe(8);
  });

  test("findDirectChildren identifies correct child checkboxes", () => {
    const checkboxes = [
      { indentation: 0, checked: true, text: "Parent" },
      { indentation: 4, checked: false, text: "Child 1" },
      { indentation: 4, checked: false, text: "Child 2" },
      { indentation: 0, checked: true, text: "Another Parent" },
    ];

    const children = findDirectChildren(checkboxes[0], checkboxes, 0, 4);
    expect(children).toHaveLength(2);
    expect(children[0].text).toBe("Child 1");
    expect(children[1].text).toBe("Child 2");
  });

  test("validateNestedCheckboxes handles single level checkboxes", () => {
    const checkboxes = [
      { indentation: 0, checked: true, text: "Item 1" },
      { indentation: 0, checked: true, text: "Item 2" },
    ];

    const errors = [];
    validateNestedCheckboxes("Test Section", checkboxes, errors);
    expect(errors).toHaveLength(0);
  });

  test("validateNestedCheckboxes handles empty checkbox list", () => {
    const errors = [];
    validateNestedCheckboxes("Test Section", [], errors);
    expect(errors).toHaveLength(0);
  });

  test("validateSectionRules passes with all required checkboxes", () => {
    const checkboxes = [
      { indentation: 0, checked: true, text: "Item 1" },
      { indentation: 0, checked: true, text: "Item 2" },
    ];

    const errors = [];
    validateSectionRules("Test Section", { rule: "all_checked" }, checkboxes, checkboxes, errors);
    expect(errors).toHaveLength(0);
  });
});

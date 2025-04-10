import * as core from "@actions/core";

/**
 * Parses markdown content to find checkbox items and their states
 * @param {string} content - Markdown content to parse
 * @returns {Array<{indentation: number, checked: boolean, text: string}>} Parsed checkboxes
 */
function parseCheckboxes(content) {
  const checkboxes = [];

  if (!content || typeof content !== "string") {
    core.debug("No content or invalid content provided for checkbox parsing");
    return checkboxes;
  }

  core.debug(`Parsing checkbox content (${content.length} chars)`);
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    const checkboxMatch = line.match(/^(\s*)- \[([xX ])\] (.+)/);
    if (checkboxMatch) {
      const indentation = checkboxMatch[1].length;
      const isChecked = checkboxMatch[2].trim().toLowerCase() === "x";
      const text = checkboxMatch[3].trim();

      checkboxes.push({ indentation, checked: isChecked, text });
      core.debug(
        `Found checkbox at line ${index + 1}: [${isChecked ? "x" : " "}] ${text} (indentation: ${indentation})`
      );
    }
  });

  core.debug(`Parsed ${checkboxes.length} checkboxes from section content`);
  return checkboxes;
}

/**
 * Validates that parent checkboxes have all children checked
 * @param {string} sectionName - Name of the section being validated
 * @param {Array} checkboxes - List of parsed checkboxes
 * @param {string[]} errors - Array to collect validation errors
 */
function validateNestedCheckboxes(sectionName, checkboxes, errors) {
  if (!checkboxes || checkboxes.length === 0) {
    core.debug(`No checkboxes to validate nested structure for`);
    return;
  }

  core.debug(`Validating nested checkboxes structure for "${sectionName}" with ${checkboxes.length} checkboxes`);

  const levels = [...new Set(checkboxes.map((cb) => cb.indentation))].sort((a, b) => a - b);
  core.debug(`Found ${levels.length} indentation levels: ${levels.join(", ")}`);

  if (levels.length <= 1) {
    core.debug(`Only one indentation level found, no nested validation needed`);
    return;
  }

  checkboxes.forEach((checkbox, index) => {
    if (!checkbox.checked) return;

    const nextLevel = levels.find((l) => l > checkbox.indentation);
    if (!nextLevel) return;

    const children = findDirectChildren(checkbox, checkboxes, index, nextLevel);
    core.debug(`Checkbox "${checkbox.text}" has ${children.length} direct children`);

    if (children.length > 0 && children.some((child) => !child.checked)) {
      const uncheckedChildren = children.filter((child) => !child.checked).map((child) => child.text);
      core.warning(
        `In "${sectionName}" section, parent checkbox "${
          checkbox.text
        }" is checked but has unchecked children: ${uncheckedChildren.join(", ")}`
      );
      errors.push(`In "${sectionName}" section, "${checkbox.text}" is checked but has unchecked sub-items`);
    }
  });
}

/**
 * Finds direct child checkboxes of a parent checkbox
 * @param {Object} parent - Parent checkbox
 * @param {Array} checkboxes - All checkboxes in the section
 * @param {number} startIndex - Index to start searching from
 * @param {number} childLevel - Indentation level of direct children
 * @returns {Array} Direct children checkboxes
 */
function findDirectChildren(parent, checkboxes, startIndex, childLevel) {
  core.debug(`Finding direct children of "${parent.text}" starting from index ${startIndex}`);
  const children = [];

  for (let i = startIndex + 1; i < checkboxes.length; i++) {
    const currentBox = checkboxes[i];

    if (currentBox.indentation <= parent.indentation) {
      core.debug(`Stopped at index ${i} - found next item at same or higher level`);
      break;
    }

    if (currentBox.indentation === childLevel) {
      children.push(currentBox);
      core.debug(`Found direct child: ${currentBox.text} [${currentBox.checked ? "x" : " "}]`);
    }
  }

  return children;
}

/**
 * Validates a section's checkboxes against configuration rules
 * @param {string} sectionName - Name of the section
 * @param {Object} sectionConfig - Configuration for the section
 * @param {string} sectionContent - Content of the section
 * @param {string[]} errors - Array to collect validation errors
 */
function validateSection(sectionName, sectionConfig, sectionContent, errors) {
  core.info(`📋 Validating section "${sectionName}" with rule: ${sectionConfig.rule || "none"}`);

  if (!sectionContent || typeof sectionContent !== "string") {
    core.warning(`Section "${sectionName}" is empty or invalid`);
    errors.push(`Section "${sectionName}" is empty or invalid`);
    return;
  }

  const checkboxes = parseCheckboxes(sectionContent);
  if (checkboxes.length === 0) {
    core.info(`Section "${sectionName}" contains no checkboxes, skipping validation`);
    return;
  }

  const checkedBoxes = checkboxes.filter((cb) => cb.checked);
  core.info(`Section "${sectionName}" has ${checkboxes.length} checkboxes, ${checkedBoxes.length} are checked`);

  validateSectionRules(sectionName, sectionConfig, checkboxes, checkedBoxes, errors);
}

/**
 * Validates section checkboxes against specific rules
 * @param {string} sectionName - Name of the section
 * @param {Object} sectionConfig - Configuration for the section
 * @param {Array} checkboxes - All checkboxes in the section
 * @param {Array} checkedBoxes - Checked checkboxes in the section
 * @param {string[]} errors - Array to collect validation errors
 */
function validateSectionRules(sectionName, sectionConfig, checkboxes, checkedBoxes, errors) {
  // Apply the validation rule
  if (sectionConfig.rule === "any_checked" && checkedBoxes.length === 0) {
    core.warning(`❌ Validation failed: Section "${sectionName}" requires at least one checked option`);
    errors.push(`In "${sectionName}" section, at least one option must be checked`);
  } else if (sectionConfig.rule === "all_checked" && checkedBoxes.length < checkboxes.length) {
    const uncheckedItems = checkboxes
      .filter((cb) => !cb.checked)
      .map((cb) => cb.text)
      .join(", ");
    core.warning(
      `❌ Validation failed: Section "${sectionName}" requires all options to be checked. Unchecked items: ${uncheckedItems}`
    );
    errors.push(`In "${sectionName}" section, all options must be checked`);
  } else {
    core.debug(`✅ Section "${sectionName}" passed ${sectionConfig.rule || "basic"} validation`);
  }

  // Validate nested checkbox structure if required
  if (sectionConfig.enforce_nested && checkedBoxes.length > 0) {
    core.debug(`Validating nested structure for section "${sectionName}"...`);
    validateNestedCheckboxes(sectionName, checkboxes, errors);
  }
}

export { parseCheckboxes, validateNestedCheckboxes, validateSection, validateSectionRules, findDirectChildren };

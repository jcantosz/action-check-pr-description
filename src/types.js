/**
 * A result object for validation operations
 */
class ValidationResult {
  /**
   * Creates a new validation result
   * @param {boolean} isValid - Whether validation succeeded
   * @param {Object|null} error - Error details if validation failed
   */
  constructor(isValid, error = null) {
    this.isValid = isValid;
    this.error = error;
  }
}

export { ValidationResult };

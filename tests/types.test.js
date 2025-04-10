import { ValidationResult } from "../src/types.js";

describe("ValidationResult", () => {
  test("creates success validation result", () => {
    const result = new ValidationResult(true);
    expect(result.isValid).toBe(true);
    expect(result.error).toBeNull();
  });

  test("creates failure validation result with error details", () => {
    const errorData = { message: "Invalid data", code: 400 };
    const result = new ValidationResult(false, errorData);
    expect(result.isValid).toBe(false);
    expect(result.error).toEqual(errorData);
  });
});

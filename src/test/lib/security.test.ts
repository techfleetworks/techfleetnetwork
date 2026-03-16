import { describe, it, expect } from "vitest";
import { sanitizeInput } from "@/lib/security";

/**
 * Supporting test for A03 security: Input sanitization
 */

describe("sanitizeInput (A03 security)", () => {
  it("is a function", () => {
    expect(typeof sanitizeInput).toBe("function");
  });
});

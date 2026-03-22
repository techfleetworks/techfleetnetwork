import { describe, it, expect } from "vitest";
import { normalizeQueryKey } from "@/lib/normalize-query";

describe("normalizeQueryKey", () => {
  it("groups 'cx strategy' with 'do customer experience strategy'", () => {
    const a = normalizeQueryKey("cx strategy");
    const b = normalizeQueryKey("do customer experience strategy");
    expect(a).toBe(b);
  });

  it("groups 'ux research' with 'user experience research'", () => {
    const a = normalizeQueryKey("ux research");
    const b = normalizeQueryKey("user experience research");
    expect(a).toBe(b);
  });

  it("removes stop words", () => {
    const result = normalizeQueryKey("how to learn about agile");
    expect(result).toBe("agile");
  });

  it("sorts keywords alphabetically", () => {
    const a = normalizeQueryKey("design sprint");
    const b = normalizeQueryKey("sprint design");
    expect(a).toBe(b);
  });

  it("handles empty strings", () => {
    expect(normalizeQueryKey("")).toBe("");
    expect(normalizeQueryKey("   ")).toBe("");
  });

  it("deduplicates tokens", () => {
    const result = normalizeQueryKey("agile agile methodology");
    expect(result).toBe("agile methodology");
  });
});

import { describe, it, expect } from "vitest";
import { sanitizeText, stripHtml, isSafeUrl, maskPii, safeCompare } from "@/lib/security";

/**
 * Supporting test for A03 security: Input sanitization and security utilities
 */

describe("sanitizeText", () => {
  it("escapes HTML entities", () => {
    const result = sanitizeText('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("preserves plain text", () => {
    expect(sanitizeText("Hello World")).toBe("Hello World");
  });
});

describe("stripHtml", () => {
  it("removes HTML tags", () => {
    expect(stripHtml("<b>bold</b> text")).toBe("bold text");
  });

  it("removes script tags", () => {
    expect(stripHtml('<script>alert("x")</script>')).toBe('alert("x")');
  });

  it("preserves plain text", () => {
    expect(stripHtml("no tags here")).toBe("no tags here");
  });
});

describe("isSafeUrl", () => {
  it("allows https URLs", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
  });

  it("allows http URLs", () => {
    expect(isSafeUrl("http://example.com")).toBe(true);
  });

  it("allows mailto URLs", () => {
    expect(isSafeUrl("mailto:test@example.com")).toBe(true);
  });

  it("rejects javascript: protocol", () => {
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects data: protocol", () => {
    expect(isSafeUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });
});

describe("maskPii", () => {
  it("masks all but last 4 characters", () => {
    expect(maskPii("test@example.com")).toBe("************.com");
  });

  it("fully masks short strings", () => {
    expect(maskPii("ab")).toBe("****");
  });
});

describe("safeCompare", () => {
  it("returns true for identical strings", () => {
    expect(safeCompare("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeCompare("abc", "abd")).toBe(false);
  });

  it("returns false for different length strings", () => {
    expect(safeCompare("abc", "abcd")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { parseRecommendations } from "@/lib/parse-explore-recommendations";

describe("parseRecommendations", () => {
  const sampleMarkdown = `### Agile Handbook
**Type:** User Guide
**Description:** A comprehensive guide to agile practices at Tech Fleet.
**🌟 Why We Recommend:** This handbook teaches you how agile works, step by step. It's great for people who want to understand how teams work together.
**Link:** https://techfleet.org/agile-handbook

### Design Sprint Workshop
**Type:** Template
**Description:** Facilitation guide for running design sprints.
**🌟 Why We Recommend:** If you want to learn how to run workshops, this template walks you through every step.

### Observer Course
**Type:** Course
**Description:** Learn how to observe and give feedback.
**🌟 Why We Recommend:** This course helps you practice watching how teams work and sharing what you notice.
**Link:** https://techfleet.org/observer`;

  const noTypeSample = `### Resource A
**Description:** Helps with testing.
**🌟 Why We Recommend:** Great for beginners.
**Link:** https://techfleet.org/resource-a`;

  it("parses correct number of recommendations", () => {
    const results = parseRecommendations(sampleMarkdown);
    expect(results).toHaveLength(3);
  });

  it("extracts title, type, description, reason, and link", () => {
    const results = parseRecommendations(sampleMarkdown);
    expect(results[0].title).toBe("Agile Handbook");
    expect(results[0].type).toBe("user guide");
    expect(results[0].description).toContain("comprehensive guide");
    expect(results[0].reason).toContain("agile works");
    expect(results[0].link).toBe("https://techfleet.org/agile-handbook");
  });

  it("handles missing link gracefully", () => {
    const results = parseRecommendations(sampleMarkdown);
    expect(results[1].link).toBeUndefined();
  });

  it("normalises legacy type labels", () => {
    const md = `### Test
**Type:** Handbook
**Description:** A test resource.
**🌟 Why We Recommend:** Good for testing.`;
    const results = parseRecommendations(md);
    expect(results[0].type).toBe("user guide");
  });

  it("returns empty array for empty input", () => {
    expect(parseRecommendations("")).toEqual([]);
  });

  it("handles missing Type field gracefully (defaults to course)", () => {
    const results = parseRecommendations(noTypeSample);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("course");
    expect(results[0].title).toBe("Resource A");
  });

  it("skips sections with no description or reason", () => {
    const md = `### Noise Header
Some random text that doesn't match the field pattern.`;
    const results = parseRecommendations(md);
    expect(results).toHaveLength(0);
  });

  it("handles malformed markdown gracefully", () => {
    const md = `### 
**Description:** 
**🌟 Why We Recommend:** `;
    // Should not throw
    const results = parseRecommendations(md);
    expect(Array.isArray(results)).toBe(true);
  });
});

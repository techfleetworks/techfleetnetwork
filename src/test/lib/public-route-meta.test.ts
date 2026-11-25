import { describe, it, expect } from "vitest";
import {
  landingMeta,
  coursesCatalogMeta,
  projectOpeningsListMeta,
  classDetailMeta,
  courseDetailMeta,
  projectOpeningMeta,
  formatTitle,
  absoluteUrl,
  jsonLdToString,
  withContext,
  BASE_URL,
  type PageMeta,
} from "@/lib/seo/public-route-meta";

const STATIC: ReadonlyArray<readonly [string, PageMeta, string]> = [
  ["landing", landingMeta(), "/"],
  ["courses", coursesCatalogMeta(), "/courses"],
  ["openings", projectOpeningsListMeta(), "/project-openings"],
];

describe("public-route-meta — static route builders", () => {
  it.each(STATIC)("%s returns complete, well-formed meta", (_name, meta, path) => {
    expect(meta.title.trim().length).toBeGreaterThan(0);
    expect(meta.description.trim().length).toBeGreaterThan(20);
    expect(meta.canonicalPath).toBe(path);
    expect(meta.ogType).toBe("website");
    expect(meta.jsonLd).toBeTruthy();
  });

  it("each static route's JSON-LD wraps into a valid @context/@graph document", () => {
    for (const [, meta] of STATIC) {
      const doc = withContext(meta.jsonLd!);
      expect(doc["@context"]).toBe("https://schema.org");
      expect(Array.isArray(doc["@graph"])).toBe(true);
      expect(() => JSON.parse(jsonLdToString(doc))).not.toThrow();
    }
  });
});

describe("formatTitle / absoluteUrl", () => {
  it("applies the brand suffix exactly once (idempotent)", () => {
    const once = formatTitle("Courses");
    expect(once).toContain("Tech Fleet Network Platform");
    // An already-branded title is returned unchanged — no double suffix.
    expect(formatTitle(once)).toBe(once);
  });

  it("builds a canonical URL from a root-relative path; empty path -> site root", () => {
    expect(absoluteUrl("/courses")).toBe(`${BASE_URL}/courses`);
    expect(absoluteUrl("")).toBe(BASE_URL);
  });
});

describe("jsonLdToString — script-breakout guard", () => {
  it("DISCRIMINATING: escapes every '<' so a value cannot close the <script> tag", () => {
    const s = jsonLdToString({ "@type": "Thing", name: "</script><script>alert(1)" });
    // No raw '<' survives in the serialized body...
    expect(s).not.toContain("<");
    expect(s).toContain("\\u003c");
    // ...and it is still valid JSON that round-trips to the original value.
    expect(JSON.parse(s).name).toBe("</script><script>alert(1)");
  });
});

describe("public-route-meta — dynamic (entity) builders", () => {
  it("courseDetailMeta uses the summary and marks the Course free", () => {
    const meta = courseDetailMeta({
      courseKey: "agile-mindset",
      displayLabel: "Agile Mindset",
      summary: "how to build a mindset of agility.",
      lessonCount: 25,
      moduleCount: 5,
    });
    expect(meta.canonicalPath).toBe("/course/agile-mindset");
    expect(meta.ogType).toBe("article");
    expect(meta.description).toContain("This free Tech Fleet course teaches you how to build a mindset of agility.");
    expect(meta.description).toContain("25 lessons across 5 modules");
    const ld = meta.jsonLd as Record<string, unknown>;
    expect(ld["@type"]).toBe("Course");
    expect(ld.isAccessibleForFree).toBe(true);
  });

  it("courseDetailMeta falls back cleanly when there is no summary", () => {
    const meta = courseDetailMeta({
      courseKey: "observer-course",
      displayLabel: "Observer Course",
      summary: null,
      lessonCount: 8,
      moduleCount: 2,
    });
    expect(meta.description).toContain("A free Tech Fleet course: 8 lessons across 2 modules");
  });

  it("classDetailMeta uses the summary, else a track-aware fallback", () => {
    const withSummary = classDetailMeta({ slug: "x", title: "X", summaryText: "Real summary.", trackLabel: "basic" });
    expect(withSummary.description).toBe("Real summary.");
    expect(withSummary.canonicalPath).toBe("/classes/x");
    const fallback = classDetailMeta({ slug: "y", title: "Y", summaryText: "   ", trackLabel: "advanced" });
    expect(fallback.description).toContain("A Tech Fleet advanced class");
  });

  it("projectOpeningMeta uses the description, else a roles-based fallback", () => {
    const withDesc = projectOpeningMeta({ id: "1", title: "Build X", descriptionText: "Ship a thing." });
    expect(withDesc.description).toBe("Ship a thing.");
    expect(withDesc.canonicalPath).toBe("/project-openings/1");
    const fallback = projectOpeningMeta({ id: "2", title: "Y", descriptionText: "", teamHats: ["Designer", "PM", "", "Dev", "QA"] });
    expect(fallback.description).toContain("looking for Designer, PM, Dev");
  });
});

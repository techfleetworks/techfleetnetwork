import { describe, it, expect } from "vitest";
import {
  landingMeta,
  coursesCatalogMeta,
  projectOpeningsListMeta,
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

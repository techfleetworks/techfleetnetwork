// Mutation-climb batch 3 (CI-refactor): kill surviving/no-coverage mutants in three security
// helpers in src/lib/security.ts — isAuthorizedObjectAccess (object/tenant access control),
// safeRegexTest (ReDoS length guard), and sanitizeHtml (length cap + whitespace normalization +
// tag allow-list). Every branch, boundary, and allow-list entry is asserted so a mutation (||/&&,
// ===/!==, >/>=, a dropped guard, a blanked replacement or tag string) changes an asserted outcome.
import { describe, it, expect } from "vitest";
import { isAuthorizedObjectAccess, safeRegexTest, sanitizeHtml, sanitizeFileName } from "@/lib/security";

const A = "550e8400-e29b-41d4-a716-446655440000";
const B = "660e8400-e29b-41d4-a716-446655440001";

describe("isAuthorizedObjectAccess — every branch", () => {
  it("allows the owner acting on their own object (no tenant)", () => {
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A })).toBe(true);
  });

  it("rejects an invalid actor or owner UUID", () => {
    expect(isAuthorizedObjectAccess({ actorUserId: "nope", ownerUserId: A })).toBe(false);
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: "nope" })).toBe(false);
  });

  it("admin bypasses the owner check (isAdmin === true), non-admin does not", () => {
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: B, isAdmin: true })).toBe(true);
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: B, isAdmin: false })).toBe(false);
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: B })).toBe(false);
  });

  it("admin does NOT bypass an invalid UUID (the uuid guard runs first)", () => {
    // Kills the `||`->`&&` mutant at the uuid guard: with `&&`, a single invalid UUID slips past
    // and `isAdmin: true` would wrongly authorize.
    expect(isAuthorizedObjectAccess({ actorUserId: "nope", ownerUserId: A, isAdmin: true })).toBe(false);
    expect(isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: "nope", isAdmin: true })).toBe(false);
  });

  it("enforces tenant isolation when either tenant id is present", () => {
    // both present + equal -> allowed; both present + different -> denied
    expect(
      isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A, actorTenantId: "t1", resourceTenantId: "t1" }),
    ).toBe(true);
    expect(
      isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A, actorTenantId: "t1", resourceTenantId: "t2" }),
    ).toBe(false);
    // only one side present -> denied (kills the || that enters the tenant block)
    expect(
      isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A, actorTenantId: "t1" }),
    ).toBe(false);
    expect(
      isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A, resourceTenantId: "t1" }),
    ).toBe(false);
    // both present but EMPTY strings -> denied. Kills the `!actorTenantId || !resourceTenantId` guard
    // being dropped: without it, `"" === ""` at the next line would wrongly authorize empty tenants.
    expect(
      isAuthorizedObjectAccess({ actorUserId: A, ownerUserId: A, actorTenantId: "", resourceTenantId: "" }),
    ).toBe(false);
  });
});

describe("sanitizeFileName — unsafe characters are replaced", () => {
  it("replaces a non-safe character with an underscore (not with nothing)", () => {
    expect(sanitizeFileName("a@b.png")).toBe("a_b.png");
  });
});

describe("safeRegexTest — ReDoS length guard and boundary", () => {
  it("tests the pattern when input is within the length limit", () => {
    expect(safeRegexTest(/abc/, "xxabcxx")).toBe(true);
    expect(safeRegexTest(/zzz/, "xxabcxx")).toBe(false);
  });

  it("enforces an explicit maxLength boundary (len==max tested, len==max+1 rejected)", () => {
    expect(safeRegexTest(/.*/, "abcde", 5)).toBe(true); // length 5 == max -> tested, matches
    expect(safeRegexTest(/.*/, "abcdef", 5)).toBe(false); // length 6 > max -> rejected regardless
  });

  it("applies the default 10000 limit: a matching but over-long input is rejected", () => {
    expect(safeRegexTest(/a/, "a".repeat(10_000))).toBe(true);
    expect(safeRegexTest(/a/, "a".repeat(10_001))).toBe(false);
  });
});

describe("sanitizeHtml — guard, normalization, and tag allow-list", () => {
  it("returns empty string for empty or non-string input", () => {
    expect(sanitizeHtml("")).toBe("");
    // Exercise the runtime typeof guard with a non-string (cast, since strictNullChecks is off so a
    // bare null would not be a type error and `@ts-expect-error` would be reported unused).
    expect(sanitizeHtml(null as unknown as string)).toBe("");
  });

  it("normalizes &nbsp;, U+00A0, and runs of spaces/tabs to a single space", () => {
    expect(sanitizeHtml("<p>a&nbsp;b</p>")).toBe("<p>a b</p>");
    expect(sanitizeHtml("<p>a b</p>")).toBe("<p>a b</p>");
    expect(sanitizeHtml("<p>a   b</p>")).toBe("<p>a b</p>");
  });

  it("preserves every allow-listed formatting tag", () => {
    for (const tag of ["p", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "h2", "h3", "blockquote"]) {
      expect(sanitizeHtml(`<${tag}>x</${tag}>`)).toContain(`<${tag}>`);
    }
    expect(sanitizeHtml("<p>line<br>break</p>")).toContain("<br>");
    expect(sanitizeHtml('<a href="https://example.com">link</a>')).toContain("href");
  });

  it("forces a safe target and rel on every surviving link (afterSanitizeAttributes hook)", () => {
    // The hook sets target/rel unconditionally, so assert its actual values — asserting mere presence
    // would be vacuous (the hook always adds them regardless of ALLOWED_ATTR).
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it("strips tags that are not on the allow-list (script, div, img, style, iframe)", () => {
    for (const tag of ["script", "div", "img", "style", "iframe"]) {
      expect(sanitizeHtml(`<${tag}>x</${tag}>`)).not.toContain(`<${tag}`);
    }
    // script contents are removed entirely, not just the tag
    expect(sanitizeHtml("<script>alert(1)</script>")).not.toContain("alert");
  });

  it("caps oversized input (DoS guard) so output cannot exceed the processed cap", () => {
    const huge = "a".repeat(100_001);
    const out = sanitizeHtml(huge);
    expect(out.length).toBeLessThan(huge.length);
  });
});

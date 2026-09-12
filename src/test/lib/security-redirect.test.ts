import { describe, it, expect } from "vitest";
import { toSafeRedirectPath, fingerprintUserId, stripTagsFixpoint } from "@/lib/security";

// Security regression for the open-redirect + XSS closed in the auth register
// flow (CodeQL js/client-side-unvalidated-url-redirection, js/xss). Mirrors the
// @security scenarios in src/features/auth/auth-redirect.feature.
describe("toSafeRedirectPath", () => {
  it("keeps a safe same-origin relative path", () => {
    expect(toSafeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(toSafeRedirectPath("/projects/42?tab=tasks#top")).toBe("/projects/42?tab=tasks#top");
  });

  it("falls back on an absolute URL to another origin", () => {
    expect(toSafeRedirectPath("https://evil.example/steal")).toBe("/dashboard");
  });

  it("falls back on a protocol-relative //host (open-redirect vector)", () => {
    expect(toSafeRedirectPath("//evil.example")).toBe("/dashboard");
  });

  it("falls back on a javascript: URL (XSS vector)", () => {
    expect(toSafeRedirectPath("javascript:alert(1)")).toBe("/dashboard");
  });

  it("falls back on backslash tricks", () => {
    expect(toSafeRedirectPath("/\\evil.example")).toBe("/dashboard");
  });

  it("honors a custom fallback and treats null/empty as absent", () => {
    expect(toSafeRedirectPath(null, "")).toBe("");
    expect(toSafeRedirectPath("", "/profile-setup")).toBe("/profile-setup");
    expect(toSafeRedirectPath("https://evil.example", "")).toBe("");
  });
});

describe("stripTagsFixpoint (no-DOM fallback owner)", () => {
  it("strips tags to plain text", () => {
    expect(stripTagsFixpoint("<p>hi <b>there</b></p>")).toBe("hi there");
  });
  it("defeats nested reconstruction (fixpoint, not single-pass)", () => {
    expect(/<script/i.test(stripTagsFixpoint("<scr<script>ipt>x</scr</script>ipt>"))).toBe(false);
  });
  it("honors a separator for word spacing", () => {
    expect(stripTagsFixpoint("a<br>b", " ")).toBe("a b");
  });
});

describe("fingerprintUserId", () => {
  it("is deterministic and non-reversible (does not contain the id)", () => {
    const id = "9f1c2b3a-1111-4222-8333-444455556666";
    const fp = fingerprintUserId(id);
    expect(fp).toBe(fingerprintUserId(id));
    expect(fp).not.toContain(id);
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
  });

  it("distinguishes different ids", () => {
    expect(fingerprintUserId("user-a")).not.toBe(fingerprintUserId("user-b"));
  });
});

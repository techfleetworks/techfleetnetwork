// B8: redirect-back builders must return the visitor to a SAME-ORIGIN page only.
// Discriminating cases cover the open-redirect guard (OWASP Unvalidated Redirects).
import { describe, it, expect } from "vitest";
import { loginRedirectHref, registerRedirectHref } from "@/lib/visibility/auth-gated-redirect";

describe("auth-gated redirect-back (B8)", () => {
  it("returns the visitor to a same-origin path after sign in / join", () => {
    expect(loginRedirectHref("/courses")).toBe("/login?redirect=%2Fcourses");
    expect(registerRedirectHref("/project-openings/abc")).toBe(
      "/register?redirect=%2Fproject-openings%2Fabc",
    );
  });

  it("preserves a query string on the return path", () => {
    expect(loginRedirectHref("/courses?tab=onboarding")).toBe(
      "/login?redirect=%2Fcourses%3Ftab%3Donboarding",
    );
  });

  it("DISCRIMINATING: an absolute off-origin URL is rejected → falls back to /", () => {
    expect(loginRedirectHref("https://evil.example.com/phish")).toBe("/login?redirect=%2F");
    expect(registerRedirectHref("https://evil.example.com/phish")).toBe("/register?redirect=%2F");
  });

  it("DISCRIMINATING: a protocol-relative //host is rejected → falls back to /", () => {
    expect(loginRedirectHref("//evil.example.com")).toBe("/login?redirect=%2F");
  });
});

import { describe, it, expect } from "vitest";
import {
  AUTH_GATED_ACTIONS,
  filterNavForAuth,
  isAuthGatedAction,
  isPublicNavHref,
  isPublicPath,
} from "@/lib/visibility/public-nav-policy";

describe("public-nav-policy (A5)", () => {
  it("surfaces /courses and /project-openings in the nav (B11); authed-only routes are not", () => {
    // /project-openings became a surfaced nav href in B11 (2026-11-24) when the
    // public openings list shipped; its detail subpath was already viewable.
    expect(isPublicNavHref("/courses")).toBe(true);
    expect(isPublicNavHref("/project-openings")).toBe(true);
    expect(isPublicNavHref("/dashboard")).toBe(false);
    expect(isPublicNavHref("/applications")).toBe(false);
    expect(isPublicNavHref("/my-journey")).toBe(false);
  });

  it("treats detail subpaths and home as public (project-openings detail stays viewable)", () => {
    expect(isPublicPath("/courses/intro-to-ai")).toBe(true);
    expect(isPublicPath("/project-openings/abc-123")).toBe(true);
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/applications/42")).toBe(false);
  });

  it("gates apply/register/enroll/mark-complete behind auth", () => {
    for (const a of ["apply", "register", "enroll", "mark-complete"]) {
      expect(isAuthGatedAction(a)).toBe(true);
    }
    expect(isAuthGatedAction("view")).toBe(false);
    expect(AUTH_GATED_ACTIONS.has("apply")).toBe(true);
  });

  it("filterNavForAuth: authed sees all, anon sees only the public subset", () => {
    const items = [
      { href: "/dashboard", label: "Home" },
      { href: "/courses", label: "Courses" },
      { href: "/project-openings", label: "Project Openings" },
      { href: "/applications", label: "Applications" },
      { href: "/my-journey", label: "My Journey" },
    ];
    expect(filterNavForAuth(items, true)).toHaveLength(5);
    const anon = filterNavForAuth(items, false);
    // Anon sees the two surfaced public nav hrefs (B11 added /project-openings);
    // authed-only routes are filtered out.
    expect(anon.map((i) => i.href)).toEqual(["/courses", "/project-openings"]);
  });
});

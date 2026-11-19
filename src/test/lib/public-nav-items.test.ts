// B8: the logged-out nav may only list hrefs the A5 policy authorizes for anon.
// This binds the UI nav list to the policy so a non-public href can never appear
// in the logged-out shell without this test failing.
import { describe, it, expect } from "vitest";
import { PUBLIC_NAV_ITEMS } from "@/components/PublicNavItems";
import { isPublicPath, isPublicNavHref, PUBLIC_NAV_HREFS } from "@/lib/visibility/public-nav-policy";

describe("PublicNavItems ↔ public-nav policy (B8)", () => {
  it("every logged-out nav href is a public path per the A5 policy", () => {
    for (const item of PUBLIC_NAV_ITEMS) {
      expect(isPublicPath(item.href)).toBe(true);
    }
  });

  it("every policy public-nav href appears in the nav (reverse binding)", () => {
    // Guards the other direction: a route the A5 policy exposes must actually be
    // surfaced in the logged-out nav, so a newly-public route can't silently stay
    // hidden from visitors.
    const navHrefs = new Set(PUBLIC_NAV_ITEMS.map((i) => i.href));
    for (const href of PUBLIC_NAV_HREFS) {
      expect(navHrefs.has(href)).toBe(true);
    }
  });

  it("non-home nav hrefs are explicit public nav hrefs", () => {
    for (const item of PUBLIC_NAV_ITEMS) {
      if (item.href === "/") continue; // home is public via isPublicPath, not a nav-href entry
      expect(isPublicNavHref(item.href)).toBe(true);
    }
  });

  it("DISCRIMINATING: an authed-only route would fail the policy check", () => {
    // Guards the test itself: /dashboard is NOT public, so if someone added it to
    // the nav the first assertion above would fail.
    expect(isPublicPath("/dashboard")).toBe(false);
  });

  it("surfaces the decided labels (Home, Courses, Project Openings)", () => {
    expect(PUBLIC_NAV_ITEMS.map((i) => i.label)).toEqual(["Home", "Courses", "Project Openings"]);
  });
});

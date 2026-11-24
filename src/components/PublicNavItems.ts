// Single source of the logged-out nav items (public-access B8).
//
// The hrefs here are the public surface the A5 policy (src/lib/visibility/
// public-nav-policy.ts) authorizes for an anonymous visitor; the labels + icons
// are the UI projection of that policy. Both the desktop public sidebar
// (PublicSidebar) and the mobile public menu (AppLayout) render FROM this list,
// so the logged-out nav is defined exactly once — no component re-lists it.
//
// Decided with the owner 2026-11-18: the catalog item is "Courses" (not
// "Classes"); the route stays /courses. A test asserts every href here is a
// public path per the policy, so a non-public href can never slip into the nav.
//
// Project Openings joined the logged-out nav in B11 (2026-11-24): its anon detail
// gateway was already live, and the public openings LIST now ships too, so anon is
// no longer bounced to login. Its href is in PUBLIC_NAV_HREFS (public-nav-policy).
import { Home, GraduationCap, Handshake, type LucideIcon } from "lucide-react";

export interface PublicNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const PUBLIC_NAV_ITEMS: readonly PublicNavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Courses", href: "/courses", icon: GraduationCap },
  { label: "Project Openings", href: "/project-openings", icon: Handshake },
];

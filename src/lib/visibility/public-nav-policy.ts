// Public visibility Strategy — client/presentation half (public-access A5).
// The server-side half (which FIELDS each auth state may read) lives in
// supabase/functions/_shared/public-visibility.ts and is the real enforcement
// (ADR-20261116: presentation never DECIDES visibility, it reflects it). This
// module is the single source of truth for which NAV routes a logged-out visitor
// may see/open and which ACTIONS always require auth, so the sidebar and pages
// consume one policy instead of scattering `if (user)` checks.

/**
 * Path roots a logged-out visitor may VIEW directly — the route and its detail
 * subpaths (e.g. /courses/:slug, /project-openings/:id). Distinct from what the
 * nav SURFACES (PUBLIC_NAV_HREFS): a path can be publicly viewable by link
 * without yet appearing in the logged-out nav.
 */
export const PUBLIC_PATH_ROOTS = new Set<string>(["/courses", "/project-openings"]);

/**
 * Routes SURFACED in the logged-out nav (§6.4). A subset of PUBLIC_PATH_ROOTS:
 * /project-openings is viewable (its anon detail gateway is live) but the openings
 * LIST view is not built for anon yet, so it is intentionally NOT surfaced in the
 * nav (owner decision 2026-11-19). Re-add it here AND in PublicNavItems when the
 * public openings list ships — see docs/public-access/BUILD-PLAN.md.
 */
export const PUBLIC_NAV_HREFS = new Set<string>(["/courses"]);

/** Is this exact href SURFACED in the logged-out nav? */
export function isPublicNavHref(href: string): boolean {
  return PUBLIC_NAV_HREFS.has(href);
}

/** May a logged-out visitor view this path (a public path root or its detail subpath)? */
export function isPublicPath(path: string): boolean {
  for (const root of PUBLIC_PATH_ROOTS) {
    if (path === root || path.startsWith(root + "/")) return true;
  }
  return path === "/" || path === "/home";
}

/**
 * Actions that ALWAYS require a signed-in user. A logged-out visitor sees them
 * but is sent to login (redirect-back) rather than performing them — never hidden,
 * never allowed for anon.
 */
export const AUTH_GATED_ACTIONS = new Set<string>([
  "apply",
  "register",
  "enroll",
  "mark-complete",
]);

export function isAuthGatedAction(action: string): boolean {
  return AUTH_GATED_ACTIONS.has(action);
}

/**
 * Filter a nav item list for the viewer's auth state: a signed-in user sees every
 * item; a logged-out visitor sees only the public subset. One place, so no page or
 * component re-implements the rule.
 */
export function filterNavForAuth<T extends { href: string }>(
  items: readonly T[],
  isAuthed: boolean,
): T[] {
  if (isAuthed) return [...items];
  return items.filter((item) => isPublicNavHref(item.href));
}

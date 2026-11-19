// Public visibility Strategy — client/presentation half (public-access A5).
// The server-side half (which FIELDS each auth state may read) lives in
// supabase/functions/_shared/public-visibility.ts and is the real enforcement
// (ADR-20261116: presentation never DECIDES visibility, it reflects it). This
// module is the single source of truth for which NAV routes a logged-out visitor
// may see/open and which ACTIONS always require auth, so the sidebar and pages
// consume one policy instead of scattering `if (user)` checks.

/**
 * Routes a logged-out visitor may see in the nav and open directly (§6.4). Detail
 * subpaths (e.g. /courses/:slug, /project-openings/:id) are covered by isPublicPath.
 * Everything else in the platform nav is authed-only and absent for anon.
 */
export const PUBLIC_NAV_HREFS = new Set<string>(["/courses", "/project-openings"]);

/** Is this exact nav href part of the logged-out surface? */
export function isPublicNavHref(href: string): boolean {
  return PUBLIC_NAV_HREFS.has(href);
}

/** May a logged-out visitor view this path (a public nav href or its detail subpath)? */
export function isPublicPath(path: string): boolean {
  for (const href of PUBLIC_NAV_HREFS) {
    if (path === href || path.startsWith(href + "/")) return true;
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

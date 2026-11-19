// Redirect-back for the logged-out surface (public-access B8).
//
// When an anonymous visitor signs in or joins from a public page, send them BACK
// to where they were instead of the default dashboard. These builders reuse the
// open-redirect guard (normalizeSafeRedirectTarget) so a crafted returnTo can
// never bounce the visitor off-origin (OWASP Unvalidated Redirects & Forwards).
//
// The auth engines already read `?redirect=` and re-normalize it
// (use-sign-in-engine.ts, use-register-engine.ts), so this is the single
// client-side builder for that contract — the top-bar Sign In / Join Platform
// links are its only consumers today. The per-action gate (Apply / Register on a
// class or project page) lands with those pages in Phase B (B10/B11), consuming
// isAuthGatedAction from public-nav-policy.ts; it is intentionally not built here
// (no page renders those actions yet).
import { normalizeSafeRedirectTarget } from "@/lib/security";

/** Login URL that returns the visitor to `returnTo` (same-origin or an allowlisted
 *  domain; anything else collapses to `/`) after sign-in. */
export function loginRedirectHref(returnTo: string): string {
  const safe = normalizeSafeRedirectTarget(returnTo, "/");
  return `/login?redirect=${encodeURIComponent(safe)}`;
}

/** Register URL that returns the visitor to `returnTo` (same-origin or an allowlisted
 *  domain; anything else collapses to `/`) after joining. */
export function registerRedirectHref(returnTo: string): string {
  const safe = normalizeSafeRedirectTarget(returnTo, "/");
  return `/register?redirect=${encodeURIComponent(safe)}`;
}

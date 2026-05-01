/**
 * Canonical production origin for auth-email links.
 *
 * Why this exists:
 * Sign-up confirmation links and password-reset links are sent by email and
 * clicked LATER, often on a different device. If we pass `window.location.origin`
 * as the redirect target, the link will point to whatever host the user happened
 * to be browsing — which is frequently the Lovable preview host
 * (`id-preview--*.lovable.app`). Recipients then land on the preview build
 * instead of production, see broken/expired sessions, or the link silently
 * fails the Supabase Auth allowlist check.
 *
 * Auth emails must ALWAYS link to the published production origin. Use
 * `getCanonicalAppOrigin()` instead of `window.location.origin` whenever
 * constructing a URL that will be embedded in an email.
 *
 * If we ever add new production hosts (custom domains), add them to
 * KNOWN_PRODUCTION_HOSTS so a user already on that host stays on it.
 */
const PRIMARY_PRODUCTION_ORIGIN = "https://techfleet.network";

const KNOWN_PRODUCTION_HOSTS = new Set<string>([
  "techfleetnetwork.lovable.app",
  "www.techfleet.network",
  "techfleet.network",
]);

export function getCanonicalAppOrigin(): string {
  if (typeof window === "undefined") return PRIMARY_PRODUCTION_ORIGIN;
  try {
    const host = window.location.hostname.toLowerCase();
    if (KNOWN_PRODUCTION_HOSTS.has(host)) {
      return `${window.location.protocol}//${window.location.host}`;
    }
  } catch {
    /* fall through to primary */
  }
  return PRIMARY_PRODUCTION_ORIGIN;
}

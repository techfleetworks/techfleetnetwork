/**
 * Gumroad helpers — turn a stored membership SKU into a manage URL the
 * member can use to upgrade, downgrade, or cancel directly on Gumroad.
 *
 * The stored `profiles.membership_sku` may be one of:
 *   - bare permalink slug:  "founding-membership"
 *   - short product URL:    "https://techfleet.gumroad.com/l/founding-membership"
 *   - long product URL:     "https://gumroad.com/l/founding-membership?variant=…"
 *
 * Gumroad's logged-in customer manage page lives at:
 *   https://app.gumroad.com/d/{permalink}/manage
 *
 * If the customer isn't already signed in to Gumroad, that page redirects
 * them through the standard email-magic-link flow before showing the
 * subscription controls — same as the "manage" link in their original
 * receipt.
 */

const GUMROAD_LIBRARY_FALLBACK = "https://app.gumroad.com/library";

/** Strip a stored SKU down to its bare permalink slug. */
export function getGumroadPermalink(sku: string | null | undefined): string | null {
  if (!sku || typeof sku !== "string") return null;
  const trimmed = sku.trim();
  if (!trimmed) return null;

  // If it's a URL, extract the path segment after `/l/` (Gumroad product URL).
  try {
    const u = new URL(trimmed);
    if (!/(^|\.)gumroad\.com$/i.test(u.hostname)) return null;
    const match = u.pathname.match(/\/l\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
    return null;
  } catch {
    // Not a URL — treat as a bare slug. Allow letters, digits, dashes, underscores.
    if (/^[a-z0-9_-]+$/i.test(trimmed)) return trimmed;
    return null;
  }
}

/**
 * Returns the Gumroad customer-side manage URL for a given stored SKU,
 * or the generic library URL if the SKU can't be parsed. Never returns
 * null so the UI always has a working fallback for paid members.
 */
export function getGumroadManageUrl(sku: string | null | undefined): string {
  const slug = getGumroadPermalink(sku);
  if (slug) return `https://app.gumroad.com/d/${slug}/manage`;
  return GUMROAD_LIBRARY_FALLBACK;
}

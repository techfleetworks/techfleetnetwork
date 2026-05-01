const OAUTH_UI_MARKER_KEY = "tfn_oauth_ui_initiated";
const OAUTH_UI_MARKER_TTL_MS = 10 * 60 * 1000;

/**
 * Origins that are considered "ours" for the OAuth-initiation guard. A user may
 * click Google on one of these origins and land on another (e.g. the OAuth
 * broker normalizes between `techfleet.network` and `www.techfleet.network`),
 * so we treat them as interchangeable when validating the marker.
 */
const TRUSTED_OAUTH_ORIGINS = new Set<string>([
  "https://techfleetnetwork.lovable.app",
  "https://www.techfleet.network",
  "https://techfleet.network",
]);

type OAuthUiMarker = {
  provider: "google" | "apple";
  origin: string;
  createdAtMs: number;
};

function parseHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

/**
 * Read the marker. We prefer localStorage (survives cross-origin redirects on
 * the same eTLD+1 better than sessionStorage in Safari/iOS where ITP partitions
 * session storage during third-party bounces) and fall back to sessionStorage
 * for backwards compatibility with markers set by older builds.
 */
function readMarkerRaw(): string | null {
  try {
    const fromLocal = window.localStorage?.getItem(OAUTH_UI_MARKER_KEY);
    if (fromLocal) return fromLocal;
  } catch { /* storage disabled */ }
  try {
    return window.sessionStorage?.getItem(OAUTH_UI_MARKER_KEY) ?? null;
  } catch { return null; }
}

function writeMarkerRaw(value: string) {
  try { window.localStorage?.setItem(OAUTH_UI_MARKER_KEY, value); } catch { /* ignore */ }
  try { window.sessionStorage?.setItem(OAUTH_UI_MARKER_KEY, value); } catch { /* ignore */ }
}

function clearMarkerRaw() {
  try { window.localStorage?.removeItem(OAUTH_UI_MARKER_KEY); } catch { /* ignore */ }
  try { window.sessionStorage?.removeItem(OAUTH_UI_MARKER_KEY); } catch { /* ignore */ }
}

export function markOAuthUiInitiated(provider: "google" | "apple") {
  const marker: OAuthUiMarker = {
    provider,
    origin: window.location.origin,
    createdAtMs: Date.now(),
  };
  writeMarkerRaw(JSON.stringify(marker));
}

export function clearOAuthUiMarker() {
  clearMarkerRaw();
}

export function hasFreshOAuthUiMarker(now = Date.now()) {
  const raw = readMarkerRaw();
  if (!raw) return false;

  try {
    const marker = JSON.parse(raw) as Partial<OAuthUiMarker>;
    if (typeof marker.createdAtMs !== "number") return false;
    if (now - marker.createdAtMs > OAUTH_UI_MARKER_TTL_MS) return false;
    // Accept the marker if the origin matches the current one OR if both the
    // recorded origin and the current origin are in our trusted set. This
    // prevents legitimate cross-origin OAuth bounces (e.g. apex ↔ www) from
    // being treated as a CSRF attempt and forcibly signing the user out.
    const currentOrigin = window.location.origin;
    if (marker.origin === currentOrigin) return true;
    if (
      typeof marker.origin === "string" &&
      TRUSTED_OAUTH_ORIGINS.has(marker.origin) &&
      TRUSTED_OAUTH_ORIGINS.has(currentOrigin)
    ) {
      return true;
    }
    return false;
  } catch {
    clearOAuthUiMarker();
    return false;
  }
}

export function isRootOAuthCallback(url = new URL(window.location.href)) {
  const hash = parseHashParams(url.hash);
  const isAuthCallback = url.searchParams.has("code") || hash.has("access_token") || hash.has("refresh_token");
  return url.pathname === "/" && isAuthCallback;
}

export function stripRootOAuthCallbackUrl() {
  if (!isRootOAuthCallback()) return;
  window.history.replaceState({}, document.title, window.location.origin + "/");
}

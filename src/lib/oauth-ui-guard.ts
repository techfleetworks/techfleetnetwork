const OAUTH_UI_MARKER_KEY = "tfn_oauth_ui_initiated";
const OAUTH_UI_MARKER_TTL_MS = 10 * 60 * 1000;

type OAuthUiMarker = {
  provider: "google" | "apple";
  origin: string;
  createdAtMs: number;
};

function parseHashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

export function markOAuthUiInitiated(provider: "google" | "apple") {
  const marker: OAuthUiMarker = {
    provider,
    origin: window.location.origin,
    createdAtMs: Date.now(),
  };
  sessionStorage.setItem(OAUTH_UI_MARKER_KEY, JSON.stringify(marker));
}

export function clearOAuthUiMarker() {
  sessionStorage.removeItem(OAUTH_UI_MARKER_KEY);
}

export function hasFreshOAuthUiMarker(now = Date.now()) {
  const raw = sessionStorage.getItem(OAUTH_UI_MARKER_KEY);
  if (!raw) return false;

  try {
    const marker = JSON.parse(raw) as Partial<OAuthUiMarker>;
    return (
      marker.origin === window.location.origin &&
      typeof marker.createdAtMs === "number" &&
      now - marker.createdAtMs <= OAUTH_UI_MARKER_TTL_MS
    );
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
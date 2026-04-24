// Stable per-device identifier used by the admin second-factor login gate so
// that verification persists for 30 days without re-prompting on every JWT
// refresh or login.
//
// Hardening: We persist the id in BOTH localStorage and a long-lived
// (1-year) cookie. The cookie survives many partial storage clears that
// would otherwise reset localStorage (e.g., "clear browsing data → cookies
// only kept", some privacy extensions, certain managed-device profiles), and
// the localStorage copy survives cookie-only clears. On every read we sync
// the two so they cannot drift apart on the same device. Clearing BOTH
// (or using a fresh browser/profile) intentionally re-prompts — same
// security posture as a brand-new device.

const STORAGE_KEY = "tfn.device_id.v1";
const COOKIE_KEY = "tfn_device_id_v1";
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 year

function generate(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isValidId(id: string | null | undefined): id is string {
  return !!id && id.length >= 32 && id.length <= 256 && /^[a-f0-9]+$/i.test(id);
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + COOKIE_KEY + "=([^;]+)"),
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(id: string): void {
  if (typeof document === "undefined") return;
  try {
    // SameSite=Lax + Secure (when on https) keeps the cookie usable across
    // OAuth round-trips while staying CSRF-safe. Path=/ so every route sees it.
    const isSecure = typeof location !== "undefined" && location.protocol === "https:";
    document.cookie =
      `${COOKIE_KEY}=${encodeURIComponent(id)}; ` +
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax` +
      (isSecure ? "; Secure" : "");
  } catch {
    // ignore — falls back to localStorage-only durability
  }
}

function readLocal(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLocal(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore — falls back to cookie-only durability
  }
}

/**
 * Returns a stable per-device id. Reads from localStorage and cookie,
 * preferring whichever is valid; if both exist the localStorage value wins
 * (it predates cookie hardening for some users) and the cookie is rewritten
 * to match. If neither has a valid id, a new one is generated and written
 * to both.
 */
export function getDeviceId(): string {
  const fromLocal = readLocal();
  const fromCookie = readCookie();

  let id: string | null = null;
  if (isValidId(fromLocal)) id = fromLocal;
  else if (isValidId(fromCookie)) id = fromCookie;

  if (!id) id = generate();

  // Sync both stores so they cannot drift after this call.
  if (fromLocal !== id) writeLocal(id);
  if (fromCookie !== id) writeCookie(id);

  return id;
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hash that is unique per (user, device) and stable across JWT refreshes. */
export async function getDeviceVerificationHash(userId: string): Promise<string> {
  return sha256Hex(`v1:${userId}:${getDeviceId()}`);
}

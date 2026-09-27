// AUTH-CONFIRM-PREFETCH (ADR-0064) — pure builder for the URL an auth email's
// button/link points at. Extracted from the hook entrypoint so it is unit
// testable without booting Deno.serve (thin-handler rule, supabase/functions
// CLAUDE.md), and so the "signup/invite/magiclink land on the inert app page,
// never /auth/v1/verify" invariant is pinned by confirmation-url.test.ts.
//
// Confirmation links MUST land on an INERT app page, never the single-use GoTrue
// /auth/v1/verify GET: email scanners, webmail/link previews, and antivirus
// web-protection issue a GET that consumes the single-use token before the human
// clicks — the "Email link is invalid or has expired" bug. The inert landing
// runs verifyOtp only on a human gesture (mirrors AUTH-RESET-PREFETCH-001).
//
//   recovery                    -> /reset-password/confirm
//   signup | invite | magiclink -> /auth/confirm
//
// email_change is intentionally absent: its two-sided double-confirm
// (email_change_current/new + dashboard secure_email_change) needs owner
// verification before rerouting — tracked follow-up (ADR-0064 Scope).
export const INERT_LANDING_BY_TYPE: Record<string, string> = {
  recovery: "/reset-password/confirm",
  signup: "/auth/confirm",
  invite: "/auth/confirm",
  magiclink: "/auth/confirm",
};

export interface ConfirmationUrlConfig {
  appOrigin: string;
  allowedOrigins: Set<string>;
  supabaseUrl: string;
}

export function buildConfirmationUrl(
  rawType: string,
  tokenHash: string,
  redirectToRaw: string,
  cfg: ConfirmationUrlConfig
): string {
  const fallbackRedirect = redirectToRaw || `${cfg.appOrigin}/reset-password`;
  try {
    const rt = new URL(fallbackRedirect);
    const origin = cfg.allowedOrigins.has(rt.origin) ? rt.origin : cfg.appOrigin;

    const landingPath = INERT_LANDING_BY_TYPE[rawType];
    if (landingPath && tokenHash) {
      const target = new URL(landingPath, origin);
      target.searchParams.set("token_hash", tokenHash);
      target.searchParams.set("type", rawType);
      return target.toString();
    }
  } catch {
    // fall through to the standard verify URL
  }

  // Fallback (email_change, or a missing token_hash): the standard GoTrue verify
  // endpoint, which validates the token_hash server-side then redirects.
  const verify = new URL("/auth/v1/verify", cfg.supabaseUrl);
  verify.searchParams.set("token", tokenHash);
  verify.searchParams.set("type", rawType);
  verify.searchParams.set("redirect_to", fallbackRedirect);
  return verify.toString();
}

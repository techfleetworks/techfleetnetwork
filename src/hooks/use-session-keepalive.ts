import { useEffect } from "react";
import { sessionPort } from "@/features/auth/ports/session.port";

/**
 * How often, while enabled, we check whether the access token is close to expiry.
 * Small relative to the refresh margin (5 min, see session.service) so several
 * attempts fit before a token actually expires.
 */
const KEEPALIVE_TICK_MS = 60 * 1000;

/**
 * Keeps an OPEN tab's session alive (ADR-0054).
 *
 * TFN issues a 1-hour access token and otherwise relied entirely on the Supabase
 * SDK's background auto-refresh, which acquires the GoTrue Web Lock and cannot
 * recover when that lock wedges — so a member actively working in a single tab was
 * signed out the instant the token expired, invisibly. This hook makes refresh the
 * app's responsibility: while enabled it asks the session owner to refresh the
 * token shortly before it expires (via `withAuthLockRetry`, which recovers from the
 * broken lock), on a steady tick and whenever the tab regains focus/visibility
 * (catching a token that lapsed while the tab was hidden).
 *
 * It does NOT keep an idle member signed in forever — the idle guard (ADR-0049)
 * still signs out after 60 minutes of no activity. This only guarantees that an
 * open tab's token is renewed rather than left to expire mid-session.
 */
export function useSessionKeepalive(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      // Fire-and-forget: the service never throws and returns an outcome for tests.
      void sessionPort.refreshIfExpiringSoon();
    };

    tick(); // check immediately on mount / login
    const interval = window.setInterval(tick, KEEPALIVE_TICK_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled]);
}

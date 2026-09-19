/**
 * Session-timeout policy — the SINGLE source of truth for how long a TFN
 * browser session lasts. ADR-0049.
 *
 * TFN signs a user out only after a stretch of NO activity (an idle timeout).
 * Mouse / keyboard / scroll / touch / focus / tab-visibility, and playing media
 * or a focused iframe, all count as activity and reset the idle clock — see
 * `src/lib/session-activity.ts` (cross-tab tracker) and
 * `src/hooks/use-idle-timeout.ts` (in-session warned timer). An actively-working
 * user is therefore never signed out mid-work by the client.
 *
 * There is one long ABSOLUTE backstop measured from session start. It exists so a
 * session left open on an unattended/shared device, or a hijacked refresh token,
 * cannot live forever (an unbounded session is an OWASP session-management smell).
 * It is set FAR above any real work session, so it never interrupts active use —
 * it only bounds an abandoned one.
 *
 * Every place that enforces or displays a session timeout imports from here.
 * Do NOT hardcode a timeout duration anywhere else, and do NOT reintroduce a
 * second timeout "clock" constant (that was the two-clock bug ADR-0049 removed).
 * `scripts/ci/check-session-timeout-single-owner.mjs` fails CI on either.
 */

/** Sign the user out after this long with NO activity. */
export const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/** Warn the user this long before the idle sign-out fires (a chance to stay in). */
export const SESSION_IDLE_WARNING_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Absolute backstop from session start. Deliberately long — it must never
 * interrupt an actively-working user, only bound a stale/abandoned session.
 * NOT Infinity (unbounded sessions are an OWASP smell), but far beyond any single
 * work session. Changing this is a security decision: record it in an ADR.
 */
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

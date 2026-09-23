# ADR 0054 — The app owns access-token refresh, so an active tab is never signed out mid-session

- Status: Accepted
- Date: 2026-09-21
- Deciders: TechFleet (owner)
- Related: `src/features/auth/services/session.service.ts` (`refreshIfExpiringSoon`), `src/hooks/use-session-keepalive.ts`, `src/components/SessionKeepalive.tsx`, `src/features/auth/ports/session.port.ts`, `src/lib/auth/auth-lock-retry.ts` (the Web-Lock recovery this depends on), ADR-0049 (client idle policy — the idle guard that still owns idle logout), `06-auth-flow-lockdown.skill.md`. Skills: `sre-operational-readiness`, `owasp-secure-coding-bdd`.

## Context and problem statement

A member actively working in a **single foreground tab** was repeatedly signed out at ~60 minutes. The evidence, pulled from Supabase, is unambiguous:

- access token lifetime = **3600 s (1 hour)**;
- the GoTrue session row had **`refreshed_at = null`** — the token was **never refreshed**;
- **`not_after = null`** — there is no server-side time-box (dashboard caps are off);
- and there was **no `audit_log` row** for the logout — because the session is already dead when the app notices (the app can't log a write it has no valid session for).

The app sets `autoRefreshToken: true` on the Supabase client and otherwise relied **entirely** on the SDK's background refresh. That refresh acquires the GoTrue **Web Lock**, and cannot recover when that lock wedges — the documented TFN class that `auth-lock-retry.ts` exists for. A 1-hour token with **no app-owned refresh** plus a wedged lock is a deterministic hourly logout, invisible to logging, regardless of activity. (A prior attempt bumped the JWT expiry to 8 h — a band-aid that only widened the window; it reverted to the 1-hour default and the real bug resurfaced. CLAUDE.md forbids re-adding that band-aid.)

## Decision drivers

- Keeping an open, actively-used tab signed in is table-stakes and a solved problem; the platform should **own that guarantee**, not delegate it to an opaque SDK timer.
- **Recover from the known Web-Lock wedge** — the specific thing the SDK's refresh cannot do.
- Don't re-introduce the token-lifetime band-aid.
- Leave the idle logout (ADR-0049) intact — an idle member should still be signed out.

## Considered options

1. **Re-bump the JWT expiry (8–24 h).** Rejected — a band-aid; a wedged refresh still logs the member out at the (longer) expiry, and it hides the real fault.
2. **Disable the SDK auto-refresh and own it entirely.** Rejected — removes the best-effort fallback and edits the frozen client config; larger blast radius.
3. **App-owned keepalive on top of the SDK (chosen).** Keep `autoRefreshToken: true` as best-effort, and add an app-owned refresh that renews the token shortly before expiry through `withAuthLockRetry` (which recovers the broken lock), driven by a hook and mounted app-wide.

## Decision outcome

**Chosen: Option 3.**

- **`sessionService.refreshIfExpiringSoon(now)`** (the session owner): reads the current token's expiry and, when it is within `SESSION_REFRESH_MARGIN_MS` (5 min), refreshes via `withAuthLockRetry(() => supabase.auth.refreshSession())`. A transient failure keeps the session (a later tick retries before real expiry); only a genuinely invalid refresh token clears local auth (logged as `invalid_refresh_token_cleared`). Never throws; returns an outcome for tests. Exposed on `sessionPort`.
- **`useSessionKeepalive(enabled)`** + **`<SessionKeepalive/>`**: while signed in, calls the refresh on mount, every 60 s, and whenever the tab regains focus/visibility (catching a token that lapsed while hidden). Mounted app-wide beside `IdleTimeoutGuard`.
- The **idle guard (ADR-0049)** still signs out a genuinely idle member; this only guarantees that an _open_ tab's token is renewed rather than left to expire.
- **Enforcement:** `session-refresh.service.test.ts` proves refresh-before-expiry and, critically, **recovery from a wedged Web Lock**; `session-keepalive-mounted.smoke.test.ts` fails if `<SessionKeepalive/>` is ever removed from the shell.

## Consequences

**Good**

- An actively-used single tab is no longer signed out at token expiry; the refresh recovers from the wedged Web Lock the SDK couldn't.
- The guarantee is owned, tested, and can't silently regress (the smoke test). No token band-aid.

**Trade-offs / honest limits**

- Browser background execution isn't 100% — a fully suspended/discarded tab won't tick until it resumes. But on resume, the focus/visibility handler refreshes immediately, and if the refresh token is still valid the session restores; a genuinely dropped network or a wiped store still ends in a **clean re-login, never a silent mid-work drop**.
- A truly invalid refresh token still signs the member out (correctly), now logged.
- Runtime monitoring — scheduling the existing `auth-prober` `session_refresh` stage to page if refresh breaks in prod — is the natural follow-up, not included here.

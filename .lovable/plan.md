# Stop signing out active users

## Root cause

There are two idle-timeout systems running side-by-side, but only one of them actually watches the user:

1. **`IdleTimeoutGuard`** (`src/components/IdleTimeoutGuard.tsx` + `useIdleTimeout`) — listens to mouse/keyboard/scroll/touch and resets a 60-minute timer. This one works correctly.
2. **`AuthService.getSession`** policy check (`src/services/auth.service.ts`) — re-reads a `lastActivityAtMs` marker from `sessionStorage` and signs the user out if it's >60 min old.

The bug is in #2: `lastActivityAtMs` is only refreshed inside `getSession()` itself (via `touchSessionMarker`). It is **never updated when the user moves the mouse, types, scrolls, or watches a video**. So:

- A user reads a long page or watches a 60+ min lesson → no React Query refetches happen → `getSession()` isn't called → marker goes stale.
- Next time anything triggers `getSession()` (route change, refetch, focus), it sees `idleMs > 60 min` and force-signs-out an actively-engaged user.

It also uses `sessionStorage`, so the marker is per-tab and doesn't see activity in sibling tabs.

## Fix

Make real user activity the source of truth for `lastActivityAtMs`, shared across tabs, with the same iframe/media awareness `useIdleTimeout` already has.

### Steps

1. **New module `src/lib/session-activity.ts`**
   - `recordActivity()` writes `Date.now()` to `localStorage` under a single key (e.g. `tfn:last-activity-at`) — throttled to once every 5s to keep writes cheap.
   - `getLastActivityAt()` reads it, falling back to `Date.now()` when missing.
   - `installSessionActivityTracker()` attaches the same DOM listener set used by `useIdleTimeout` (`mousedown`, `mousemove`, `keydown`, `scroll`, `touchstart`, `click`, `input`, `focus`, `change`, plus `visibilitychange`) and the same iframe-focus + `<video>`/`<audio>` polling, all calling `recordActivity()`. Idempotent so it can be mounted once at app boot.

2. **`src/App.tsx`** — call `installSessionActivityTracker()` once on mount (alongside or just before `<IdleTimeoutGuard />`). Tracker runs whether or not the dialog is mounted, so background tabs and pre-route-load activity still count.

3. **`src/services/auth.service.ts`**
   - In `readSessionMarker`, when computing `lastActivityAtMs` use `Math.max(markerLastActivity, getLastActivityAt())`. This means real DOM activity always beats the stale marker.
   - In `touchSessionMarker`, also persist `Math.max(Date.now(), getLastActivityAt())` so cross-tab activity is preserved.
   - Keep the existing 60-minute `IDLE_SESSION_AGE_MS` and the absolute-timeout disable (`MAX_SESSION_AGE_MS = Infinity`) — both are correct policy.

4. **`src/hooks/use-idle-timeout.ts`** — small extension: also call `recordActivity()` from its existing `handleActivity` and media-poll paths so the warning dialog and the session marker can never disagree.

5. **`src/components/MfaEnforcementGuard.tsx`** — no change needed; it only signs out on user cancel.

### Tests

- Update `src/test/services/auth.service.test.ts`: existing "idle session" test should still pass (no DOM activity → marker stale → sign-out). Add a new case where `localStorage` `tfn:last-activity-at` is recent → `getSession()` does NOT sign the user out even if the in-marker `lastActivityAtMs` is stale.
- New `src/test/lib/session-activity.test.ts` covering throttle, cross-tab read, and the iframe/`<video>` poll path.

### BDD

Add a scenario to `bdd_scenarios` (feature: Authentication & Security) — "Active user is never timed out":
- Given a signed-in user with a stale in-tab marker but recent `tfn:last-activity-at`
- When `getSession()` runs
- Then [UI] no redirect to `/login`, [DB] no `session_idle_timeout` row inserted into `account_activity`, [Code] `getSessionPolicyFailureReason` returns `null`.

## What this does NOT change

- 60-minute idle policy stays.
- Server-side `revoked_sessions` check stays.
- MFA enforcement stays.
- Admin 30-min idle / 4h max policy (separate code path) is untouched.

## Risk

Low — purely additive. Worst case the tracker over-reports activity, which only means users stay signed in slightly longer (the desired outcome). The 5-second write throttle + `localStorage` keep cost negligible.

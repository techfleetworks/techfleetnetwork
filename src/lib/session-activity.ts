/**
 * Cross-tab "last user activity" tracker.
 *
 * The session-idle policy in `AuthService.getSession` used to read its
 * `lastActivityAtMs` only from a sessionStorage marker that was refreshed
 * inside `getSession()` itself. That meant a user who was actively reading,
 * scrolling, or watching a video — but not triggering React Query refetches —
 * could be silently signed out at the next route change.
 *
 * This module is the source of truth for "the user did something recently".
 * It listens for the same DOM signals as `useIdleTimeout`, plus iframe focus
 * and `<video>`/`<audio>` playback (so YouTube-embedded lessons count as
 * activity), throttles writes to once every 5 seconds, and persists to
 * `localStorage` so every tab sees the same value.
 */

const LAST_ACTIVITY_KEY = "tfn:last-activity-at";
const WRITE_THROTTLE_MS = 5_000;
const POLL_INTERVAL_MS = 30_000;

const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "keyup",
  "scroll",
  "touchstart",
  "click",
  "input",
  "focus",
  "change",
  "visibilitychange",
] as const;

let installed = false;
let lastWriteAt = 0;

export function recordActivity(now: number = Date.now()): void {
  if (typeof window === "undefined") return;
  if (now - lastWriteAt < WRITE_THROTTLE_MS) return;
  lastWriteAt = now;
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // localStorage may be unavailable (private mode, quota); fail open.
  }
}

/**
 * Returns the last recorded activity timestamp in ms, or 0 when none has ever
 * been recorded. Callers that want a sensible default (e.g. "treat fresh tab
 * as active now") should `Math.max(getLastActivityAt(), Date.now())`.
 * Returning 0 for the missing case is intentional: it lets a stored
 * sessionStorage marker still drive the idle decision when no DOM activity
 * has been observed yet (e.g. server-side tests, just-rehydrated tab).
 */
export function getLastActivityAt(now: number = Date.now()): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    // Future-dated values (clock skew) are clamped to now.
    return parsed > now ? now : parsed;
  } catch {
    return 0;
  }
}

function isMediaActive(): boolean {
  try {
    const active = document.activeElement;
    if (active && active.tagName === "IFRAME") return true;
    return Array.from(
      document.querySelectorAll<HTMLMediaElement>("video, audio"),
    ).some((el) => !el.paused && !el.ended && el.currentTime > 0);
  } catch {
    return false;
  }
}

/**
 * Idempotent. Safe to call from React StrictMode double-mount.
 */
export function installSessionActivityTracker(): () => void {
  if (typeof window === "undefined") return () => undefined;
  if (installed) return () => undefined;
  installed = true;

  // Seed so a fresh tab doesn't appear stale.
  recordActivity();

  const handler = () => recordActivity();
  ACTIVITY_EVENTS.forEach((event) => {
    document.addEventListener(event, handler, { passive: true });
  });

  const poll = window.setInterval(() => {
    if (isMediaActive()) recordActivity();
  }, POLL_INTERVAL_MS);

  return () => {
    ACTIVITY_EVENTS.forEach((event) => {
      document.removeEventListener(event, handler);
    });
    window.clearInterval(poll);
    installed = false;
  };
}

/** Test-only reset hook. */
export function __resetSessionActivityForTests(): void {
  installed = false;
  lastWriteAt = 0;
  try {
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // ignore
  }
}

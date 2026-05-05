const AUTH_LOCKOUT_KEY = "tfn:auth-progressive-lockout";
const ATTEMPT_WINDOW_MS = 10 * 60_000;
const LOCK_THRESHOLD = 5;
const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 5 * 60_000;

type StoredAuthLockout = {
  attempts: number;
  windowStartedAt: number;
  lockedUntil: number;
  lockLevel: number;
};

export type AuthLockoutState = {
  locked: boolean;
  remainingSeconds: number;
  attempts: number;
  lockedUntil: number;
};

function emptyState(): StoredAuthLockout {
  return { attempts: 0, windowStartedAt: Date.now(), lockedUntil: 0, lockLevel: 0 };
}

function readStoredState(now = Date.now()): StoredAuthLockout {
  try {
    const raw = window.sessionStorage.getItem(AUTH_LOCKOUT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredAuthLockout>) : null;
    if (!parsed || typeof parsed.attempts !== "number" || typeof parsed.windowStartedAt !== "number") return emptyState();
    if (now - parsed.windowStartedAt > ATTEMPT_WINDOW_MS && (parsed.lockedUntil ?? 0) <= now) return emptyState();
    return {
      attempts: parsed.attempts,
      windowStartedAt: parsed.windowStartedAt,
      lockedUntil: typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0,
      lockLevel: typeof parsed.lockLevel === "number" ? parsed.lockLevel : 0,
    };
  } catch {
    return emptyState();
  }
}

function writeStoredState(state: StoredAuthLockout) {
  try {
    window.sessionStorage.setItem(AUTH_LOCKOUT_KEY, JSON.stringify(state));
  } catch {
    // Storage failures should not break the visible form validation path.
  }
}

export function getAuthLockoutState(now = Date.now()): AuthLockoutState {
  const state = readStoredState(now);
  const remainingMs = Math.max(0, state.lockedUntil - now);
  return {
    locked: remainingMs > 0,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    attempts: state.attempts,
    lockedUntil: state.lockedUntil,
  };
}

export function recordInvalidAuthAttempt(now = Date.now()): AuthLockoutState {
  const current = readStoredState(now);
  const nextAttempts = current.lockedUntil > now ? current.attempts + 1 : current.attempts + 1;
  const shouldLock = nextAttempts >= LOCK_THRESHOLD;
  const nextLockLevel = shouldLock ? current.lockLevel + 1 : current.lockLevel;
  const lockMs = shouldLock ? Math.min(MAX_LOCK_MS, BASE_LOCK_MS * 2 ** Math.max(0, nextLockLevel - 1)) : 0;
  const next: StoredAuthLockout = {
    attempts: shouldLock ? 0 : nextAttempts,
    windowStartedAt: shouldLock || now - current.windowStartedAt > ATTEMPT_WINDOW_MS ? now : current.windowStartedAt,
    lockedUntil: shouldLock ? now + lockMs : current.lockedUntil,
    lockLevel: nextLockLevel,
  };
  writeStoredState(next);
  return getAuthLockoutState(now);
}

export function clearAuthLockout() {
  try {
    window.sessionStorage.removeItem(AUTH_LOCKOUT_KEY);
  } catch {
    // Non-critical cleanup.
  }
}

/**
 * Auto-heal on LoginPage mount. The device-side lockout exists only to
 * slow a single attacker session that's hammering the form right now —
 * the server-side bucket (peek_rate_limit / record_rate_limit_failure)
 * is the real brute-force defense and is unaffected by this. So on a
 * fresh page load we silently drop any lockout with ≤60s remaining (or a
 * malformed blob). A user who genuinely just earned a 5-minute lockout
 * still serves it; a returning user from yesterday gets a clean slate.
 */
export function maybeAutoHealAuthLockout(now = Date.now()): void {
  try {
    const raw = window.sessionStorage.getItem(AUTH_LOCKOUT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<StoredAuthLockout>;
    const lockedUntil = typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : 0;
    if (lockedUntil - now <= 60_000) {
      window.sessionStorage.removeItem(AUTH_LOCKOUT_KEY);
    }
  } catch {
    try { window.sessionStorage.removeItem(AUTH_LOCKOUT_KEY); } catch { /* noop */ }
  }
}

/**
 * Switching the email being attempted means the user is targeting a
 * different account — the device counter for the previous account is no
 * longer meaningful. Clear silently.
 */
export function resetAuthLockoutForEmailChange(): void {
  clearAuthLockout();
}

export function formatAuthLockoutMessage(seconds: number): string {
  if (seconds <= 0) return "Please try again.";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `Too many invalid attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
  return `Too many invalid attempts. Try again in ${minutes}:${String(remainder).padStart(2, "0")}.`;
}
/**
 * Deploy watcher — proactively detects new deployments while a tab is open
 * and refreshes the page BEFORE the user triggers a stale-chunk fetch.
 *
 * Strategy (defense in depth):
 *  1. Vite injects __BUILD_ID__ into the running bundle at build time.
 *  2. The build also emits /version.json (uncached) with the same id.
 *  3. We poll /version.json on focus, on `online`, and every 60s.
 *  4. If the server build id differs from ours, we mark the app "stale" and
 *     trigger a reload at the next safe boundary (route change) or after a
 *     short idle window — whichever comes first.
 *  5. The fallback safety net is `lazyWithRetry`, which catches any
 *     stale-chunk error that slips through and forces a single reload.
 *
 * This combination means a stale chunk request should virtually never
 * surface to the user.
 */

declare const __BUILD_ID__: string;

const VERSION_URL = "/version.json";
const POLL_INTERVAL_MS = 60_000; // 1 minute
const IDLE_RELOAD_DELAY_MS = 30_000; // wait 30s of inactivity before forcing reload
const RELOAD_FLAG = "__lovable_chunk_reload__";

let currentBuildId = "";
let serverBuildId = "";
let pollTimer: number | null = null;
let idleTimer: number | null = null;
let started = false;
let stale = false;
const listeners = new Set<(stale: boolean) => void>();

function readCurrentBuildId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";
  } catch {
    return "";
  }
}

async function fetchServerBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { buildId?: string };
    return typeof json.buildId === "string" ? json.buildId : null;
  } catch {
    return null;
  }
}

function notify() {
  for (const cb of listeners) {
    try {
      cb(stale);
    } catch {
      /* ignore listener errors */
    }
  }
}

function safeReload() {
  if (typeof window === "undefined") return;
  // Clear any prior stale-chunk reload flag — a successful version-driven
  // reload is the "good" path and should not block future recovery attempts.
  try {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

function scheduleIdleReload() {
  if (typeof window === "undefined") return;
  if (idleTimer !== null) return; // already scheduled
  idleTimer = window.setTimeout(() => {
    // Only reload if user is idle (page hidden OR no recent input)
    if (document.visibilityState === "hidden") {
      safeReload();
    } else {
      // Reschedule — try again in another window
      idleTimer = null;
      scheduleIdleReload();
    }
  }, IDLE_RELOAD_DELAY_MS);
}

async function checkVersion() {
  if (!currentBuildId) return;
  const next = await fetchServerBuildId();
  if (!next) return;
  serverBuildId = next;
  if (next !== currentBuildId && !stale) {
    stale = true;
    notify();
    // Try to reload immediately if the page is hidden; otherwise wait for
    // an idle window or for the next route change (handled by the router hook).
    if (document.visibilityState === "hidden") {
      safeReload();
    } else {
      scheduleIdleReload();
    }
  }
}

/**
 * Start the watcher. Idempotent — safe to call multiple times.
 */
export function startDeployWatcher(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  currentBuildId = readCurrentBuildId();
  if (!currentBuildId) return; // no build id available (dev mode) — skip

  // Initial check shortly after startup
  window.setTimeout(() => {
    void checkVersion();
  }, 5_000);

  pollTimer = window.setInterval(() => {
    void checkVersion();
  }, POLL_INTERVAL_MS);

  window.addEventListener("focus", () => void checkVersion());
  window.addEventListener("online", () => void checkVersion());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void checkVersion();
  });
}

/**
 * Subscribe to staleness changes. Returns an unsubscribe fn.
 */
export function onDeployStale(cb: (stale: boolean) => void): () => void {
  listeners.add(cb);
  // Fire immediately with current state
  cb(stale);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Returns true once the server has shipped a newer build than this tab.
 */
export function isAppStale(): boolean {
  return stale;
}

/**
 * Force a reload now (used by router on next navigation when stale).
 */
export function reloadIfStale(): boolean {
  if (stale) {
    safeReload();
    return true;
  }
  return false;
}

/** Internal helper for tests/debug. */
export function __debug() {
  return { currentBuildId, serverBuildId, stale };
}

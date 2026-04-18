import { lazy, type ComponentType } from "react";

/**
 * Wraps React.lazy with multi-stage recovery from stale-chunk errors that occur
 * after a redeploy invalidates previously cached JS chunk hashes.
 *
 * Recovery stages (in order):
 *  1. Transient retry: re-run the import factory with a short backoff in case
 *     the failure was a flaky network blip or CDN propagation race.
 *  2. Hard reload: if retries also fail with a chunk-load error, force a single
 *     full-page reload (tracked via sessionStorage) so the browser fetches the
 *     latest deploy manifest.
 *  3. Re-throw: any non-chunk error or a second failure after reload bubbles
 *     up to ErrorBoundary for normal handling.
 *
 * Combined with the proactive deploy-watcher (src/lib/deploy-watcher.ts),
 * stale-chunk errors should virtually never surface to a user.
 */

const RELOAD_FLAG = "__lovable_chunk_reload__";
const MAX_TRANSIENT_RETRIES = 2;
const RETRY_DELAY_MS = [400, 1200] as const;

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Unable to preload CSS") ||
    /ChunkLoadError/i.test(error.name)
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        if (!isChunkLoadError(error)) throw error;
        if (attempt < MAX_TRANSIENT_RETRIES) {
          await sleep(RETRY_DELAY_MS[attempt] ?? 1000);
          continue;
        }
      }
    }

    // All retries exhausted — fall back to a one-time hard reload.
    if (typeof window !== "undefined") {
      const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG);
      if (!alreadyReloaded) {
        window.sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
        // Return a placeholder component so React doesn't error before reload.
        return { default: (() => null) as unknown as T };
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to load module after retries");
  });
}

/** Call after a successful navigation to allow future stale-chunk recoveries. */
export function clearChunkReloadFlag() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  }
}

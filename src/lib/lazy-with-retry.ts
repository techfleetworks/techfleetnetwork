import { lazy, type ComponentType } from "react";

/**
 * Wraps React.lazy with automatic recovery from stale-chunk errors that occur
 * after a redeploy invalidates previously cached JS chunk hashes.
 *
 * Behavior:
 * 1. If a dynamic import fails with a "Failed to fetch dynamically imported module"
 *    or similar chunk-load error, we force a hard reload — but only ONCE per session
 *    (tracked via sessionStorage) to avoid an infinite reload loop if the failure
 *    is caused by something else (e.g. user is offline).
 * 2. Any other import error is re-thrown so the ErrorBoundary can handle it.
 */

const RELOAD_FLAG = "__lovable_chunk_reload__";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    /ChunkLoadError/i.test(error.name)
  );
}

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error) && typeof window !== "undefined") {
        const alreadyReloaded = window.sessionStorage.getItem(RELOAD_FLAG);
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(RELOAD_FLAG, "1");
          // Hard reload to fetch the latest deployed manifest
          window.location.reload();
          // Return a placeholder component so React doesn't error before reload
          return { default: (() => null) as unknown as T };
        }
      }
      throw error;
    }
  });
}

/** Call after a successful navigation to allow future stale-chunk recoveries. */
export function clearChunkReloadFlag() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(RELOAD_FLAG);
  }
}

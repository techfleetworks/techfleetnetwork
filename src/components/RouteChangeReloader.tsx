import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { isAppStale, reloadIfStale } from "@/lib/deploy-watcher";
import { clearChunkReloadFlag } from "@/lib/lazy-with-retry";

/**
 * Mounted inside <BrowserRouter>. On every route change:
 *  - If a newer deploy has been detected, reload now (safe boundary —
 *    user is already navigating, so the reload is invisible).
 *  - Otherwise clear the one-shot stale-chunk reload flag so future
 *    redeploys can recover automatically.
 */
export function RouteChangeReloader() {
  const location = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (isAppStale()) {
      reloadIfStale();
      return;
    }
    clearChunkReloadFlag();
  }, [location.pathname]);

  return null;
}

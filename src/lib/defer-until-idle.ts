/**
 * useDeferredMount — returns `true` once the browser is idle after first paint.
 *
 * Used to gate Supabase realtime channel subscriptions and other non-critical
 * mount-time work so they don't compete with the initial render. On slow
 * networks (Save-Data / 2g / 3g), opening a WebSocket during hydration
 * measurably delays TTI; deferring to the first idle slot eliminates that.
 *
 * Resolution order:
 *  1. `requestIdleCallback` with a 2s timeout (preferred — yields to user input).
 *  2. `setTimeout(..., 0)` after `requestAnimationFrame` (Safari fallback).
 *
 * Stays `false` during SSR (window undefined) so hooks short-circuit cleanly.
 */
import { useEffect, useState } from "react";

type IdleHandle = number;
type IdleCallback = (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void;
interface IdleWindow extends Window {
  requestIdleCallback?: (cb: IdleCallback, opts?: { timeout?: number }) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
}

export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as IdleWindow;
    let idleHandle: IdleHandle | null = null;
    let rafHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const run = () => setReady(true);

    if (typeof w.requestIdleCallback === "function") {
      idleHandle = w.requestIdleCallback(run, { timeout: 2000 });
    } else {
      rafHandle = window.requestAnimationFrame(() => {
        timeoutHandle = setTimeout(run, 0);
      });
    }

    return () => {
      if (idleHandle !== null && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleHandle);
      }
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
  }, []);

  return ready;
}

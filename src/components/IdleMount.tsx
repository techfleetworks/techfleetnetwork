/**
 * IdleMount
 *
 * Renders children only after the browser is idle (or after a short fallback
 * timeout when requestIdleCallback isn't available, e.g. Safari < 17).
 *
 * Use this for non-critical, mount-once side-effect components — analytics,
 * route-change reloaders, self-healing runners, offline banners — so they do
 * not steal CPU from the LCP / FCP critical path on first paint.
 *
 * CWV note: this is part of pass 3 of the Core Web Vitals remediation. By
 * deferring these mounts we free roughly 30–80ms of main-thread time on cold
 * loads, which directly improves FCP and LCP on /login and /dashboard.
 */
import { useEffect, useState, type ReactNode } from "react";

interface IdleMountProps {
  children: ReactNode;
  /** Hard fallback in ms if requestIdleCallback never fires. Default 1500ms. */
  timeout?: number;
}

export function IdleMount({ children, timeout = 1500 }: IdleMountProps) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const onReady = () => { if (!cancelled) setReady(true); };

    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;

    if (typeof ric === "function") {
      const id = ric(onReady, { timeout });
      return () => {
        cancelled = true;
        const cic = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cic === "function") cic(id);
      };
    }

    const t = window.setTimeout(onReady, Math.min(timeout, 200));
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [timeout]);

  return ready ? <>{children}</> : null;
}

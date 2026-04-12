/**
 * Shared adaptive polling interval hook for React Query.
 *
 * Backs off to 4× the base interval when the browser tab is hidden,
 * reducing server load at scale. Uses React state so interval changes
 * trigger query re-configuration.
 *
 * At 10,000 users with ~30% tab-hidden rate, this saves ~22,500 queries/min.
 */
import { useState, useEffect, useCallback } from "react";

export function useAdaptiveInterval(baseMs: number): number {
  const [hidden, setHidden] = useState(document.hidden);

  const handler = useCallback(() => setHidden(document.hidden), []);

  useEffect(() => {
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [handler]);

  return hidden ? baseMs * 4 : baseMs;
}

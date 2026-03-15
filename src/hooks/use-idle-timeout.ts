import { useEffect, useRef, useCallback } from "react";

const IDLE_EVENTS = ["mousedown", "mousemove", "keydown", "scroll", "touchstart", "click"];

/**
 * Auto-signs the user out after a period of inactivity.
 * Shows a warning callback before signing out.
 */
export function useIdleTimeout({
  timeoutMs = 30 * 60 * 1000, // 30 minutes
  warningMs = 2 * 60 * 1000,  // 2 minutes before timeout
  onWarning,
  onTimeout,
  enabled = true,
}: {
  timeoutMs?: number;
  warningMs?: number;
  onWarning?: () => void;
  onTimeout: () => void;
  enabled?: boolean;
}) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWarningShown = useRef(false);

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
  }, []);

  const resetTimers = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    isWarningShown.current = false;

    // Set warning timer
    if (onWarning && warningMs < timeoutMs) {
      warningRef.current = setTimeout(() => {
        isWarningShown.current = true;
        onWarning();
      }, timeoutMs - warningMs);
    }

    // Set timeout timer
    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  }, [enabled, timeoutMs, warningMs, onWarning, onTimeout, clearTimers]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    resetTimers();

    const handleActivity = () => {
      resetTimers();
    };

    IDLE_EVENTS.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearTimers();
      IDLE_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimers, clearTimers]);

  return { resetTimers };
}

import { useEffect, useRef, useCallback } from "react";

const IDLE_EVENTS = ["mousedown", "mousemove", "keydown", "keyup", "scroll", "touchstart", "click", "input", "focus", "change"];

/**
 * Auto-signs the user out after a period of inactivity.
 * Shows a warning callback before signing out.
 *
 * IMPORTANT: when an embedded iframe (e.g. a YouTube video lesson) has focus,
 * mouse/keyboard events fire INSIDE the iframe and never reach our document
 * listeners. Without compensation, a user watching a 5–10 minute video would
 * appear idle and be silently signed out. We treat iframe focus + ongoing
 * media playback as activity by polling for focused iframes and
 * `<video>`/`<audio>` playback in addition to listening for DOM events.
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

    // --- iframe / media activity detector ---
    // YouTube embeds steal focus when the user clicks Play. Once focused,
    // none of the user's mouse/keyboard events reach this document.
    // Detect that condition (and any local <video>/<audio> currently playing)
    // and treat it as activity so we don't sign the user out mid-lesson.
    const isMediaActive = (): boolean => {
      try {
        const active = document.activeElement;
        if (active && active.tagName === "IFRAME") return true;
        const playing = Array.from(
          document.querySelectorAll<HTMLMediaElement>("video, audio")
        ).some((el) => !el.paused && !el.ended && el.currentTime > 0);
        if (playing) return true;
      } catch {
        // Cross-origin or detached — fail open (don't sign out aggressively)
        return false;
      }
      return false;
    };

    pollRef.current = setInterval(() => {
      if (isMediaActive()) resetTimers();
    }, 30 * 1000); // poll every 30s — cheap and keeps the user signed in

    return () => {
      clearTimers();
      if (pollRef.current) clearInterval(pollRef.current);
      IDLE_EVENTS.forEach((event) => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimers, clearTimers]);

  return { resetTimers };
}

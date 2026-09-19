// @vitest-environment jsdom
//
// Real behavioural coverage for the idle-timeout hook (ADR-0049). The BDD smoke
// test for "Idle Timeout Guard" only asserts App.tsx exists; this proves the
// actual contract the user cares about: sign out ONLY after a full idle window
// with no activity, reset the clock on every interaction, and warn before the cut.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { SESSION_IDLE_TIMEOUT_MS, SESSION_IDLE_WARNING_MS } from "@/lib/session-timeout-policy";

describe("useIdleTimeout (idle-only sign-out that resets on activity)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    try {
      localStorage.clear();
    } catch {
      /* jsdom without storage — ignore */
    }
  });

  it("signs out only after the full idle window with NO activity", () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout({ onTimeout }));

    act(() => {
      vi.advanceTimersByTime(SESSION_IDLE_TIMEOUT_MS - 1000);
    });
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("never signs out a user who keeps interacting — activity resets the clock", () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout({ onTimeout }));

    // Two full hours of steady work, one interaction every 10 minutes: each event is
    // well within the idle window and resets it, so the user is never cut off. This
    // is the exact complaint — "don't log me out while I'm actively working."
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(10 * 60 * 1000);
        document.dispatchEvent(new Event("mousemove"));
      });
    }
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it("warns SESSION_IDLE_WARNING_MS before the sign-out, then signs out on time", () => {
    const onWarning = vi.fn();
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout({ onWarning, onTimeout }));

    act(() => {
      vi.advanceTimersByTime(SESSION_IDLE_TIMEOUT_MS - SESSION_IDLE_WARNING_MS);
    });
    expect(onWarning).toHaveBeenCalledTimes(1);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SESSION_IDLE_WARNING_MS);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled (e.g. logged out)", () => {
    const onTimeout = vi.fn();
    renderHook(() => useIdleTimeout({ onTimeout, enabled: false }));
    act(() => {
      vi.advanceTimersByTime(SESSION_IDLE_TIMEOUT_MS * 3);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

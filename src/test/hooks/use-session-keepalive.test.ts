// @vitest-environment jsdom
//
// ADR-0054 — the keepalive hook drives token refresh while a tab is open: on mount,
// on a steady tick, and when the tab regains visibility; and does nothing when the
// member is logged out. The port is mocked so this asserts the DRIVING behaviour only.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSessionKeepalive } from "@/hooks/use-session-keepalive";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock("@/features/auth/ports/session.port", () => ({
  sessionPort: { refreshIfExpiringSoon: refreshMock },
}));

describe("useSessionKeepalive (ADR-0054)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue("still_valid");
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("checks immediately on mount, then on a steady tick while enabled", () => {
    renderHook(() => useSessionKeepalive(true));
    expect(refreshMock).toHaveBeenCalledTimes(1); // immediate on login/mount
    vi.advanceTimersByTime(60_000);
    expect(refreshMock).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(refreshMock).toHaveBeenCalledTimes(3);
  });

  it("does nothing when disabled (logged out)", () => {
    renderHook(() => useSessionKeepalive(false));
    vi.advanceTimersByTime(5 * 60_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes when the tab regains visibility (a token may have lapsed while hidden)", () => {
    renderHook(() => useSessionKeepalive(true));
    refreshMock.mockClear();
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("stops ticking after unmount", () => {
    const { unmount } = renderHook(() => useSessionKeepalive(true));
    refreshMock.mockClear();
    unmount();
    vi.advanceTimersByTime(5 * 60_000);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

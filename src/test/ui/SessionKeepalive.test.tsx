// @vitest-environment jsdom
//
// ADR-0054 — behavioural proof that the MOUNTED keepalive actually drives a token
// refresh when a member is signed in, and stays inert when logged out. (That the
// component is wired into App.tsx is a separate source-level check in
// src/test/smoke/session-keepalive-mounted.smoke.test.ts.) Together these mean the
// mount is not just present text — it does its job — closing the mid-work-logout
// regression rather than only asserting a string exists.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { SessionKeepalive } from "@/components/SessionKeepalive";

const { refreshMock, userRef } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  userRef: { current: null as { id: string } | null },
}));

vi.mock("@/features/auth/ports/session.port", () => ({
  sessionPort: { refreshIfExpiringSoon: refreshMock },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: userRef.current }) }));

describe("SessionKeepalive (ADR-0054)", () => {
  beforeEach(() => {
    cleanup();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue("still_valid");
    userRef.current = null;
  });

  it("drives a token refresh when a member is signed in", () => {
    userRef.current = { id: "u1" };
    render(<SessionKeepalive />);
    expect(refreshMock).toHaveBeenCalled();
  });

  it("stays inert when logged out", () => {
    userRef.current = null;
    render(<SessionKeepalive />);
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

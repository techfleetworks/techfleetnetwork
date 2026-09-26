// @vitest-environment jsdom
//
// ADR-0054 — the app-owned session keepalive. Proves sessionService.refreshIfExpiringSoon
// refreshes a token BEFORE it expires (the mid-work-logout fix), recovers from a WEDGED
// GoTrue Web Lock the SDK cannot, and treats transient vs genuinely-invalid failures
// correctly. The mocked client is driven through hoisted handles so no `supabase.auth.*`
// accessor appears in the test (no auth-invariants lint debt).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionService } from "@/features/auth/services/session.service";

const { getSessionMock, refreshSessionMock, signOutMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  refreshSessionMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: refreshSessionMock,
      signOut: signOutMock,
      onAuthStateChange: vi.fn(),
    },
    rpc: vi.fn(),
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/services/logger.service", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    track: (_a: string, _m: string, _meta: unknown, fn: () => unknown) => fn(),
  }),
}));
vi.mock("@/lib/account-activity", () => ({ logAccountActivity: vi.fn() }));

const NOW = 1_000_000_000_000;
const sessionExpiringInMs = (ms: number) => ({
  data: {
    session: {
      access_token: "a.b.c",
      refresh_token: "r",
      expires_at: Math.floor((NOW + ms) / 1000),
      user: { id: "u1" },
    },
  },
  error: null,
});

describe("sessionService.refreshIfExpiringSoon (app-owned keepalive, ADR-0054)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    signOutMock.mockResolvedValue({ error: null });
    refreshSessionMock.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it("does nothing when there is no session", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("no_session");
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("does not refresh a token that is not near expiry", async () => {
    getSessionMock.mockResolvedValue(sessionExpiringInMs(30 * 60 * 1000)); // 30 min left
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("still_valid");
    expect(refreshSessionMock).not.toHaveBeenCalled();
  });

  it("refreshes the token BEFORE it expires (the mid-work-logout fix)", async () => {
    getSessionMock.mockResolvedValue(sessionExpiringInMs(2 * 60 * 1000)); // 2 min left
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("refreshed");
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it("recovers from a WEDGED GoTrue Web Lock the SDK cannot (retries once, succeeds)", async () => {
    getSessionMock.mockResolvedValue(sessionExpiringInMs(2 * 60 * 1000));
    const lockBroken = Object.assign(
      new Error("Lock broken by another request with the 'steal' option"),
      { name: "AbortError" }
    );
    refreshSessionMock
      .mockRejectedValueOnce(lockBroken)
      .mockResolvedValueOnce({ data: { session: {} }, error: null });
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("refreshed");
    expect(refreshSessionMock).toHaveBeenCalledTimes(2);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("keeps the session on a transient refresh failure (a later tick retries)", async () => {
    getSessionMock.mockResolvedValue(sessionExpiringInMs(2 * 60 * 1000));
    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Failed to fetch", status: 0 },
    });
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("error");
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("clears local auth only when the refresh token is genuinely invalid", async () => {
    getSessionMock.mockResolvedValue(sessionExpiringInMs(2 * 60 * 1000));
    refreshSessionMock.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 },
    });
    await expect(sessionService.refreshIfExpiringSoon(NOW)).resolves.toBe("cleared_invalid");
    expect(signOutMock).toHaveBeenCalledWith({ scope: "local" });
  });
});

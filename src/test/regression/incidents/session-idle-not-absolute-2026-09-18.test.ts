// @vitest-environment jsdom
//
// Incident 2026-09-18 — "kicked out mid-work." Locks the session-idle contract in
// sessionService.getSession (the SILENT backstop path, no warning dialog) after the
// single-owner unification (ADR-0049):
//   1. An actively-working member is NEVER signed out, even when the per-tab marker
//      looks idle — the cross-tab activity tracker (fresh) wins.
//   2. The absolute cap is a real 7-day BACKSTOP, not Infinity. The third test fails
//      on the pre-ADR-0049 code (MAX_SESSION_AGE_MS = Number.POSITIVE_INFINITY) and
//      passes now — proving the backstop is bounded without ever touching active work.
//
// The mocked Supabase client is driven through hoisted local handles rather than
// `supabase.auth.*` accessors, so this test adds no auth-invariants lint debt.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionService } from "@/features/auth/services/session.service";
import { logAccountActivity } from "@/lib/account-activity";
import { fingerprintUserId } from "@/lib/security";
import { SESSION_ABSOLUTE_TIMEOUT_MS } from "@/lib/session-timeout-policy";

const { getSessionMock, signOutMock, rpcMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  signOutMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
    rpc: rpcMock,
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const makeSession = (userId: string) => ({
  access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature",
  refresh_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJyZWZyZXNoIn0.signature",
  expires_in: 600,
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  token_type: "bearer",
  user: {
    id: userId,
    email: `${userId}@example.com`,
    created_at: new Date(Date.now() - DAY).toISOString(),
    last_sign_in_at: new Date(Date.now() - HOUR).toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
  },
});

const storeToken = (session: ReturnType<typeof makeSession>) =>
  localStorage.setItem(
    "sb-project-auth-token",
    JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token })
  );

const writeMarker = (userId: string, startedAgoMs: number, lastActivityAgoMs: number) =>
  sessionStorage.setItem(
    "session_started_at",
    JSON.stringify({
      version: 2,
      uidFp: fingerprintUserId(userId),
      startedAtMs: Date.now() - startedAgoMs,
      lastActivityAtMs: Date.now() - lastActivityAgoMs,
    })
  );

describe("session idle policy: active members stay in; only a 7-day backstop bounds a stale one", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    rpcMock.mockResolvedValue({ data: false, error: null });
    signOutMock.mockResolvedValue({ error: null });
  });

  it("keeps an actively-working member signed in even when the in-tab marker looks idle", async () => {
    // Incident shape: per-tab marker says "idle 2h" but the cross-tab tracker shows
    // activity 10s ago. Fresh activity must win — this is the mid-work logout we fix.
    const session = makeSession("active-member");
    storeToken(session);
    localStorage.setItem("tfn:last-activity-at", String(Date.now() - 10_000));
    writeMarker("active-member", 3 * HOUR, 2 * HOUR);
    getSessionMock.mockResolvedValue({ data: { session }, error: null });

    await expect(sessionService.getSession()).resolves.toEqual(session);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("keeps an active member signed in well into a long session (6 days in, still working)", async () => {
    const session = makeSession("long-session-member");
    storeToken(session);
    localStorage.setItem("tfn:last-activity-at", String(Date.now() - 10_000));
    writeMarker("long-session-member", 6 * DAY, 2 * HOUR);
    getSessionMock.mockResolvedValue({ data: { session }, error: null });

    await expect(sessionService.getSession()).resolves.toEqual(session);
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("enforces the absolute backstop past 7 days even for an active member (bounded, not unbounded)", async () => {
    // FAILS on pre-ADR-0049 code: the absolute cap was Number.POSITIVE_INFINITY, so this
    // session lived forever. Now it is a real 7-day backstop.
    const session = makeSession("stale-session-member");
    storeToken(session);
    localStorage.setItem("tfn:last-activity-at", String(Date.now() - 10_000));
    writeMarker("stale-session-member", SESSION_ABSOLUTE_TIMEOUT_MS + HOUR, 5_000);
    getSessionMock.mockResolvedValue({ data: { session }, error: null });

    await expect(sessionService.getSession()).resolves.toBeNull();
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(logAccountActivity).toHaveBeenCalledWith(
      "session_expired_clientside",
      expect.objectContaining({
        userId: "stale-session-member",
        details: expect.objectContaining({ reason: "absolute_timeout" }),
      })
    );
  });
});

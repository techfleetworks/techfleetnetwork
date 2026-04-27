import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@/services/auth.service";
import { supabase } from "@/integrations/supabase/client";
import { logAccountActivity } from "@/lib/account-activity";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      signUp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/services/logger.service", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    track: (_action: string, _message: string, _meta: unknown, fn: () => unknown) => fn(),
  }),
}));

vi.mock("@/lib/account-activity", () => ({ logAccountActivity: vi.fn() }));

const makeSession = (userId: string, issuedAgoMs = 60_000) => ({
  access_token: `token-${userId}`,
  refresh_token: `refresh-${userId}`,
  expires_in: 600,
  expires_at: Math.floor((Date.now() - issuedAgoMs + 600_000) / 1000),
  token_type: "bearer",
  user: {
    id: userId,
    email: `${userId}@example.com`,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    last_sign_in_at: new Date(Date.now() - issuedAgoMs).toISOString(),
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
  },
});

describe("AuthService session max-age marker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null });
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    } as never);
  });

  it("writes a distinct audit event when an admin signs in", async () => {
    const session = makeSession("admin-user");
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: { session, user: session.user }, error: null });
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => resolve({ count: 1, error: null }),
    } as never);
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });

    await AuthService.signInWithPassword("admin@example.com", "password");
    await vi.waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("write_audit_log", expect.objectContaining({
      p_event_type: "authn_admin_login_success",
      p_user_id: "admin-user",
    })));
    expect(logAccountActivity).toHaveBeenCalledWith("login_succeeded", expect.objectContaining({ userId: "admin-user" }));
  });

  it("does not sign out a user because another account left a stale timestamp", async () => {
    const session = makeSession("current-user");
    localStorage.setItem("sb-project-auth-token", JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
    sessionStorage.setItem("session_started_at", JSON.stringify({ version: 1, userId: "different-user", startedAtMs: Date.now() - 5 * 60 * 60 * 1000 }));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toEqual(session);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("session_started_at") ?? "{}")).toMatchObject({ userId: "current-user" });
  });

  it("migrates legacy stale numeric timestamps without killing a fresh session", async () => {
    const session = makeSession("legacy-user");
    localStorage.setItem("sb-project-auth-token", JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
    sessionStorage.setItem("session_started_at", String(Date.now() - 5 * 60 * 60 * 1000));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toEqual(session);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("session_started_at") ?? "{}")).toMatchObject({ userId: "legacy-user" });
  });

  it("still expires the same user's genuinely over-age session", async () => {
    const session = makeSession("expired-user", 5 * 60 * 60 * 1000);
    localStorage.setItem("sb-project-auth-token", JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
    sessionStorage.setItem(
      "session_started_at",
      JSON.stringify({ version: 1, userId: "expired-user", startedAtMs: Date.now() - 5 * 60 * 60 * 1000 }),
    );
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });

  it("does not call the backend when no auth token is stored locally", async () => {
    await expect(AuthService.getSession()).resolves.toBeNull();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });

  it("clears local auth state when the stored refresh token has been rotated away", async () => {
    localStorage.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "missing-refresh-token" }));
    sessionStorage.setItem("session_started_at", JSON.stringify({ version: 1, userId: "user", startedAtMs: Date.now() }));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid Refresh Token: Refresh Token Not Found", status: 400 },
    });

    await expect(AuthService.getSession()).resolves.toBeNull();
    expect(localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(sessionStorage.getItem("session_started_at")).toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("recovers when the auth client throws an invalid refresh token error instead of returning one", async () => {
    localStorage.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "rotated-refresh-token" }));
    sessionStorage.setItem("sb-project-auth-token", JSON.stringify({ refresh_token: "duplicate-stale-token" }));
    sessionStorage.setItem("session_started_at", JSON.stringify({ version: 1, userId: "user", startedAtMs: Date.now() }));
    vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error("Invalid Refresh Token: refresh token already used"));

    await expect(AuthService.getSession()).resolves.toBeNull();
    expect(localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(sessionStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(sessionStorage.getItem("session_started_at")).toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
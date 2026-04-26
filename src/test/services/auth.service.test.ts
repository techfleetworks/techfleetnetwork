import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@/services/auth.service";
import { supabase } from "@/integrations/supabase/client";

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
  });

  it("does not sign out a user because another account left a stale timestamp", async () => {
    const session = makeSession("current-user");
    sessionStorage.setItem(
      "session_started_at",
      JSON.stringify({ version: 1, userId: "different-user", startedAtMs: Date.now() - 9 * 60 * 60 * 1000 }),
    );
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toEqual(session);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("session_started_at") ?? "{}")).toMatchObject({ userId: "current-user" });
  });

  it("migrates legacy stale numeric timestamps without killing a fresh session", async () => {
    const session = makeSession("legacy-user");
    sessionStorage.setItem("session_started_at", String(Date.now() - 9 * 60 * 60 * 1000));
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toEqual(session);
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("session_started_at") ?? "{}")).toMatchObject({ userId: "legacy-user" });
  });

  it("still expires the same user's genuinely over-age session", async () => {
    const session = makeSession("expired-user", 9 * 60 * 60 * 1000);
    sessionStorage.setItem(
      "session_started_at",
      JSON.stringify({ version: 1, userId: "expired-user", startedAtMs: Date.now() - 9 * 60 * 60 * 1000 }),
    );
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session }, error: null });

    await expect(AuthService.getSession()).resolves.toBeNull();
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
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
});
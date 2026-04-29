import { beforeEach, describe, expect, it, vi } from "vitest";
import { logAccountActivity } from "@/lib/account-activity";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe("account activity telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
  });

  it("SEC-AUTH-AUDIT-009: redacts login failure transport messages before audit logging", async () => {
    await logAccountActivity("login_failed", {
      email: "Member@Example.com",
      errorCode: 401,
      errorMessage: "Edge Function returned a non-2xx status code",
    });

    expect(supabase.rpc).toHaveBeenCalledWith("write_audit_log", expect.objectContaining({
      p_event_type: "login_failed",
      p_table_name: "auth.users",
      p_error_message: "Authentication attempt failed.",
      p_changed_fields: expect.arrayContaining(["code:401"]),
    }));
    expect(JSON.stringify(vi.mocked(supabase.rpc).mock.calls[0])).not.toContain("Member@Example.com");
    expect(JSON.stringify(vi.mocked(supabase.rpc).mock.calls[0])).not.toContain("non-2xx");
  });
});

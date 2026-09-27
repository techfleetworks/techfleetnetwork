import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import {
  confirmSignupByCode,
  confirmSignupByTokenHash,
} from "@/features/auth/services/confirm-signup.service";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      verifyOtp: vi.fn(),
    },
  },
}));

describe("confirm-signup.service — ADR-0064 (code-based signup confirmation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirmSignupByCode verifies the typed OTP against the email (type=signup)", async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    } as never);

    await confirmSignupByCode("member@example.com", "123456");

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: "member@example.com",
      token: "123456",
      type: "signup",
    });
  });

  it("confirmSignupByTokenHash verifies the inert-landing token_hash (type=signup)", async () => {
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    } as never);

    await confirmSignupByTokenHash("hash-abc");

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-abc",
      type: "signup",
    });
  });

  it("passes GoTrue's error through unchanged so the caller can classify it", async () => {
    const error = { message: "Token has expired or is invalid", status: 401 };
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { session: null, user: null },
      error,
    } as never);

    const res = await confirmSignupByCode("member@example.com", "000000");
    expect(res.error).toBe(error);
  });

  it("codes are scoped to the email (keycard model) — two members may share 6 digits", async () => {
    // There is no global-unique-code requirement: each verify is bound to its own
    // email, so identical digits for two accounts never collide (ADR-0064 security).
    vi.mocked(supabase.auth.verifyOtp).mockResolvedValue({
      data: { session: {}, user: {} },
      error: null,
    } as never);

    await confirmSignupByCode("a@example.com", "424242");
    await confirmSignupByCode("b@example.com", "424242");

    expect(supabase.auth.verifyOtp).toHaveBeenNthCalledWith(1, {
      email: "a@example.com",
      token: "424242",
      type: "signup",
    });
    expect(supabase.auth.verifyOtp).toHaveBeenNthCalledWith(2, {
      email: "b@example.com",
      token: "424242",
      type: "signup",
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaService } from "@/services/mfa.service";

const mockListFactors = vi.fn();
const mockUnenroll = vi.fn();
const mockEnroll = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        listFactors: () => mockListFactors(),
        unenroll: (input: { factorId: string }) => mockUnenroll(input),
        enroll: (input: { factorType: "totp"; friendlyName: string }) => mockEnroll(input),
      },
    },
  },
}));

vi.mock("@/services/logger.service", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

describe("MfaService (BDD AUTH-2FA-SETUP-RECOVERY-003)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries transient factor-list failures before showing an error", async () => {
    mockListFactors
      .mockResolvedValueOnce({ data: null, error: { message: "network timeout" } })
      .mockResolvedValueOnce({ data: { all: [] }, error: null });

    await expect(MfaService.listFactors()).resolves.toEqual([]);
    expect(mockListFactors).toHaveBeenCalledTimes(2);
  });

  it("removes stale unverified factors so retrying the same setup name succeeds", async () => {
    mockListFactors.mockResolvedValue({
      data: {
        all: [{ id: "stale-factor", factor_type: "totp", status: "unverified", friendly_name: "md" }],
      },
      error: null,
    });
    mockUnenroll.mockResolvedValue({ error: null });
    mockEnroll.mockResolvedValue({
      data: { id: "new-factor", totp: { qr_code: "qr", secret: "secret", uri: "otpauth://totp/test" } },
      error: null,
    });

    await expect(MfaService.enrollTotp(" md ")).resolves.toMatchObject({ factorId: "new-factor" });
    expect(mockUnenroll).toHaveBeenCalledWith({ factorId: "stale-factor" });
    expect(mockEnroll).toHaveBeenCalledWith({ factorType: "totp", friendlyName: "md" });
  });
});
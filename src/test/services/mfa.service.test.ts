import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaService, normalizeMfaFactors } from "@/services/mfa.service";

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

  it("recognizes verified TOTP factors returned outside the aggregate all array", async () => {
    mockListFactors.mockResolvedValue({
      data: {
        all: [],
        totp: [{ id: "totp-1", factor_type: "totp", status: "verified", friendly_name: "Authenticator" }],
      },
      error: null,
    });

    await expect(MfaService.hasVerifiedTotp()).resolves.toBe(true);
  });

  it("normalizes and de-duplicates MFA factors from supported response shapes", () => {
    expect(normalizeMfaFactors({
      all: [{ id: "totp-1", factor_type: "totp", status: "verified" }],
      totp: [{ id: "totp-1", factor_type: "totp", status: "verified" }],
      phone: [{ id: "phone-1", factor_type: "phone", status: "unverified" }],
    })).toEqual([
      expect.objectContaining({ id: "totp-1", factor_type: "totp", status: "verified" }),
      expect.objectContaining({ id: "phone-1", factor_type: "phone", status: "unverified" }),
    ]);
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
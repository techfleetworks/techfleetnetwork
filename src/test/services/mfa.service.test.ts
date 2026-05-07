import { describe, it, expect, vi, beforeEach } from "vitest";

const mockListFactors = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      mfa: { listFactors: () => mockListFactors() },
    },
  },
}));

// Build a fake JWT with a given aal claim.
function jwt(aal: string | null): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify(aal === null ? {} : { aal }));
  return `${header}.${payload}.sig`;
}

const verifiedTotp = { id: "f1", factor_type: "totp", status: "verified" };
const unverifiedTotp = { id: "f2", factor_type: "totp", status: "unverified" };

describe("MfaService.getMfaGateDecision (BDD AUTH-2FA-MEMBER-001/002, LOGIN-GATE-003)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/services/mfa.service");
    mod.__resetMfaServiceCachesForTests();
  });

  it("verified TOTP + aal1 => needsChallenge true", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [verifiedTotp], all: [verifiedTotp] }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: jwt("aal1") } } });
    const { MfaService } = await import("@/services/mfa.service");
    const d = await MfaService.getMfaGateDecision();
    expect(d).toEqual({ hasVerifiedTotp: true, currentAal: "aal1", needsChallenge: true });
  });

  it("verified TOTP + aal2 => needsChallenge false", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [verifiedTotp], all: [verifiedTotp] }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: jwt("aal2") } } });
    const { MfaService } = await import("@/services/mfa.service");
    const d = await MfaService.getMfaGateDecision();
    expect(d.needsChallenge).toBe(false);
    expect(d.hasVerifiedTotp).toBe(true);
  });

  it("no verified factor + aal1 => needsChallenge false (member without 2FA)", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [unverifiedTotp], all: [unverifiedTotp] }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: jwt("aal1") } } });
    const { MfaService } = await import("@/services/mfa.service");
    const d = await MfaService.getMfaGateDecision();
    expect(d).toEqual({ hasVerifiedTotp: false, currentAal: "aal1", needsChallenge: false });
  });

  it("no verified factor + aal2 => needsChallenge false", async () => {
    mockListFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null });
    mockGetSession.mockResolvedValue({ data: { session: { access_token: jwt("aal2") } } });
    const { MfaService } = await import("@/services/mfa.service");
    const d = await MfaService.getMfaGateDecision();
    expect(d.needsChallenge).toBe(false);
  });

  it("fails closed when listFactors throws", async () => {
    mockListFactors.mockRejectedValue(new Error("boom"));
    mockGetSession.mockResolvedValue({ data: { session: { access_token: jwt("aal1") } } });
    const { MfaService } = await import("@/services/mfa.service");
    const d = await MfaService.getMfaGateDecision();
    expect(d).toEqual({ hasVerifiedTotp: false, currentAal: null, needsChallenge: false });
  });
});

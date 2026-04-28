import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MfaEnforcementGuard } from "@/components/MfaEnforcementGuard";

const mockUseAuth = vi.fn();
const mockUseAdmin = vi.fn();
const mockGetAssuranceLevel = vi.fn();
const mockSignOut = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/use-admin", () => ({
  useAdmin: () => mockUseAdmin(),
}));

vi.mock("@/services/mfa.service", () => ({
  MfaService: { getAssuranceLevel: () => mockGetAssuranceLevel() },
}));

vi.mock("@/components/MfaChallengeDialog", () => ({
  MfaChallengeDialog: ({ open, onCancel }: { open: boolean; onCancel: () => void }) => open ? (
    <div role="dialog" aria-label="Two-Factor Verification">
      <button type="button" onClick={onCancel}>Cancel 2FA</button>
    </div>
  ) : null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: () => mockSignOut() } },
}));

describe("MfaEnforcementGuard (BDD AUTH-2FA-LOGIN-GATE-002)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
      session: { access_token: "token-1" },
      loading: false,
    });
    mockUseAdmin.mockReturnValue({ isAdmin: false, loading: false });
    mockGetAssuranceLevel.mockResolvedValue({ currentLevel: "aal1", nextLevel: "aal2", needsChallenge: true });
    mockSignOut.mockResolvedValue(undefined);
    Object.defineProperty(window, "location", {
      value: { replace: vi.fn() },
      writable: true,
    });
  });

  it("prompts any enrolled member for authenticator 2FA after password login", async () => {
    render(<MfaEnforcementGuard />);

    expect(await screen.findByRole("dialog", { name: /two-factor verification/i })).toBeInTheDocument();
    expect(mockGetAssuranceLevel).toHaveBeenCalledTimes(1);
  });

  it("signs out an AAL1 session when the user cancels the required 2FA challenge", async () => {
    render(<MfaEnforcementGuard />);

    const cancelButton = await screen.findByRole("button", { name: /cancel 2fa/i });
    cancelButton.click();

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(window.location.replace).toHaveBeenCalledWith("/login");
  });
});
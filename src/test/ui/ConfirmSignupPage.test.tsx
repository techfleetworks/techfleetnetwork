// Coverage for src/pages/ConfirmSignupPage.tsx (ADR-0064 — code-based signup
// confirmation). Renders the /auth/confirm surface and pins its security-
// critical property: it is INERT on load (a scanner/prefetch GET must not run
// verifyOtp). Verification behaviour is exercised in the engine test
// (src/features/auth/engine/__tests__/use-confirm-signup-engine.test.ts).
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ConfirmSignupPage from "@/pages/ConfirmSignupPage";
import * as confirmService from "@/features/auth/services/confirm-signup.service";

vi.mock("@/features/auth/services/confirm-signup.service", () => ({
  confirmSignupByCode: vi.fn(),
  confirmSignupByTokenHash: vi.fn(),
}));

describe("ConfirmSignupPage — src/pages/ConfirmSignupPage.tsx (ADR-0064)", () => {
  it("renders the confirm surface and does NOT verify on load (inert / prefetch-safe)", () => {
    render(
      <MemoryRouter initialEntries={["/auth/confirm"]}>
        <ConfirmSignupPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: /confirm your email/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm my email/i })).toBeInTheDocument();

    // The security invariant: merely rendering the page (what a link scanner
    // triggers) must never consume the single-use proof.
    expect(confirmService.confirmSignupByCode).not.toHaveBeenCalled();
    expect(confirmService.confirmSignupByTokenHash).not.toHaveBeenCalled();
  });
});

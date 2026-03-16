import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";

vi.mock("@/services/auth.service", () => ({
  AuthService: { resetPassword: vi.fn() },
}));
vi.mock("@/services/rate-limit.service", () => ({
  RateLimitService: { check: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retry_after: 0 }) },
}));

describe("ForgotPasswordPage UI (BDD 19.1)", () => {
  beforeEach(() => {
    renderWithRouter(<ForgotPasswordPage />);
  });

  it("19.1: renders email input", () => {
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("19.1: renders Send Reset Link button", () => {
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  });

  it("19.1: renders sign-in link", () => {
    expect(screen.getByRole("link", { name: /sign in/i })).toBeInTheDocument();
  });

  it("19.1: renders heading", () => {
    expect(screen.getByText(/reset your password/i)).toBeInTheDocument();
  });
});

import { describe, it, expect } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import RegisterPage from "@/pages/RegisterPage";
import { AuthService } from "@/services/auth.service";
import { verifyTurnstileToken } from "@/lib/turnstile-verification";

vi.mock("@/services/auth.service", () => ({
  AuthService: { signUp: vi.fn(), resendSignupConfirmation: vi.fn() },
}));
vi.mock("@/services/rate-limit.service", () => ({
  RateLimitService: { check: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retry_after: 0 }) },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn().mockResolvedValue({}) } },
}));
vi.mock("@/components/auth/TurnstileChallenge", () => ({
  TurnstileChallenge: ({ action }: { action: string }) => <div data-testid={`turnstile-${action}`} />,
}));
vi.mock("@/lib/turnstile-verification", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}));

describe("RegisterPage UI (BDD 18.1–18.4)", () => {
  beforeEach(() => {
    renderWithRouter(<RegisterPage />);
  });

  it("18.1: renders first name, last name, email, password, and confirm password fields", () => {
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i, { selector: "input#reg-password" })).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it("18.1: renders terms checkbox", () => {
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument();
  });

  it("18.1: renders Create Account button", () => {
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("18.2: password requirements checklist shows 5 items", () => {
    const passwordInput = screen.getByLabelText(/password/i, { selector: "input#reg-password" });
    fireEvent.change(passwordInput, { target: { value: "a" } });

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(screen.getByText(/one uppercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one lowercase letter/i)).toBeInTheDocument();
    expect(screen.getByText(/one number/i)).toBeInTheDocument();
    expect(screen.getByText(/one special character/i)).toBeInTheDocument();
  });

  it("18.3: Google sign-up button is present", () => {
    expect(screen.getByText(/sign up with google/i)).toBeInTheDocument();
  });

  it("18.4: sign in link points to /login", () => {
    const signInLink = screen.getByRole("link", { name: /sign in/i });
    expect(signInLink).toHaveAttribute("href", "/login");
  });

  it("AUTH-CONFIRM-RESEND-001: lets users request another verification email after signup", async () => {
    vi.mocked(AuthService.signUp).mockResolvedValueOnce({ user: { id: "new-user" }, session: null } as never);
    vi.mocked(AuthService.resendSignupConfirmation).mockResolvedValueOnce(undefined as never);

    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: "Doe" } });
    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByLabelText(/password/i, { selector: "input#reg-password" }), { target: { value: "Str0ng!Pass" } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: "Str0ng!Pass" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("heading", { name: /check your email/i })).toBeInTheDocument();
    expect(screen.getByText(/existing verified accounts will not receive another signup email/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /resend verification email/i }));

    await waitFor(() => expect(verifyTurnstileToken).toHaveBeenCalledWith("", "signup_confirmation_resend"));
    await waitFor(() => expect(AuthService.resendSignupConfirmation).toHaveBeenCalledWith(
      "jane@example.com",
      expect.stringContaining("/profile-setup")
    ));
    expect(await screen.findByText(/fresh link has been sent/i)).toBeInTheDocument();
  });
});

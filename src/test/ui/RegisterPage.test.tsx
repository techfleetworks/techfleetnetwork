import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import RegisterPage from "@/pages/RegisterPage";

vi.mock("@/services/auth.service", () => ({
  AuthService: { signUp: vi.fn() },
}));
vi.mock("@/services/rate-limit.service", () => ({
  RateLimitService: { check: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retry_after: 0 }) },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn().mockResolvedValue({}) } },
}));

describe("RegisterPage UI (BDD 18.1–18.4)", () => {
  beforeEach(() => {
    renderWithRouter(<RegisterPage />);
  });

  it("18.1: renders first name, last name, email, password fields", () => {
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("18.1: renders terms checkbox", () => {
    expect(screen.getByText(/terms of service/i)).toBeInTheDocument();
  });

  it("18.1: renders Create Account button", () => {
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("18.2: password requirements checklist shows 5 items", () => {
    const passwordInput = screen.getByLabelText(/^password$/i);
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
});

import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import LoginPage from "@/pages/LoginPage";

// Mock services
vi.mock("@/services/auth.service", () => ({
  AuthService: { signInWithPassword: vi.fn() },
}));
vi.mock("@/services/rate-limit.service", () => ({
  RateLimitService: { check: vi.fn().mockResolvedValue({ allowed: true, remaining: 5, retry_after: 0 }) },
}));
vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn().mockResolvedValue({}) } },
}));

describe("LoginPage UI (BDD 17.1–17.3)", () => {
  beforeEach(() => {
    renderWithRouter(<LoginPage />);
  });

  it("17.1: renders email and password inputs", () => {
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("17.1: renders Sign In button", () => {
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("17.1: renders forgot password link", () => {
    expect(screen.getByText(/forgot password/i)).toBeInTheDocument();
  });

  it("17.1: renders Google sign-in button", () => {
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });

  it("17.2: password visibility toggle works", () => {
    const passwordInput = screen.getByLabelText(/^password$/i) as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const toggleBtn = screen.getByLabelText(/show password/i);
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("text");

    const hideBtn = screen.getByLabelText(/hide password/i);
    fireEvent.click(hideBtn);
    expect(passwordInput.type).toBe("password");
  });

  it("17.3: sign up link points to /register", () => {
    const signUpLink = screen.getByRole("link", { name: /sign up/i });
    expect(signUpLink).toHaveAttribute("href", "/register");
  });
});

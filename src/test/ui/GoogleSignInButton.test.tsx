import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";

vi.mock("@/integrations/lovable/index", () => ({
  lovable: { auth: { signInWithOAuth: vi.fn().mockResolvedValue({}) } },
}));

describe("GoogleSignInButton UI (BDD 27.1–27.2)", () => {
  it("27.1: renders with default label", () => {
    render(<GoogleSignInButton />);
    expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
  });

  it("27.1: renders Google logo SVG", () => {
    render(<GoogleSignInButton />);
    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeTruthy();
  });

  it("27.2: renders custom label", () => {
    render(<GoogleSignInButton label="Sign up with Google" />);
    expect(screen.getByText("Sign up with Google")).toBeInTheDocument();
  });
});

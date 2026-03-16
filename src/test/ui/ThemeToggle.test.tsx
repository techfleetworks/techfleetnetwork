import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import { ThemeToggle } from "@/components/ThemeToggle";

// Mock ThemeProvider context
vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

describe("ThemeToggle UI (BDD 23.1)", () => {
  it("23.1: renders with accessible label", () => {
    render(<ThemeToggle />);
    expect(screen.getByLabelText(/toggle theme/i)).toBeInTheDocument();
  });

  it("23.1: has sr-only text", () => {
    render(<ThemeToggle />);
    expect(screen.getByText("Toggle theme")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/ThemeToggle";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: "dark", setTheme: vi.fn() }),
}));

describe("tmp ui import", () => {
  it("renders component imported from tsx", () => {
    render(createElement(ThemeToggle));
    expect(screen.getByLabelText(/toggle theme/i)).toBeInTheDocument();
  });
});

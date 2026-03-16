import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import NotFound from "@/pages/NotFound";

describe("NotFound Page UI (BDD 21.1)", () => {
  it("21.1: renders 404 heading", () => {
    renderWithRouter(<NotFound />);
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("21.1: renders 'Oops! Page not found' message", () => {
    renderWithRouter(<NotFound />);
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("21.1: renders Return to Home link", () => {
    renderWithRouter(<NotFound />);
    const link = screen.getByText("Return to Home");
    expect(link).toHaveAttribute("href", "/");
  });
});

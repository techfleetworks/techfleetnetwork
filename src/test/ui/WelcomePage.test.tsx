import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import WelcomePage from "@/pages/WelcomePage";

// Covers (bdd-gate): src/pages/WelcomePage.tsx — the routed Welcome Flow shell + steps a/c.
// Behavioral ACs: §4.2 (no Skip, Back disabled on first step) and §13 step mechanics.

describe("WelcomePage (Welcome Flow) — shell + first steps", () => {
  it("renders step (a) Welcome and exposes no Skip/close control (AC-N2)", () => {
    renderWithRouter(<WelcomePage />);
    expect(
      screen.getByRole("heading", { name: /welcome to tech fleet/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close/i })).not.toBeInTheDocument();
  });

  it("disables Back on the first step and labels the forward CTA 'Get started'", () => {
    renderWithRouter(<WelcomePage />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /get started/i })).toBeEnabled();
  });

  it("advances to step (c) on Next, enables Back, and disables Next on the last step", () => {
    renderWithRouter(<WelcomePage />);

    fireEvent.click(screen.getByRole("button", { name: /get started/i }));

    expect(
      screen.getByRole("heading", { name: /we prepare you for a changing world/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeEnabled();
    // step (c) is the last built step in PR2 → forward is disabled (no dead-end nav).
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });

  it("returns to step (a) when Back is pressed from step (c)", () => {
    renderWithRouter(<WelcomePage />);
    fireEvent.click(screen.getByRole("button", { name: /get started/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(
      screen.getByRole("heading", { name: /welcome to tech fleet/i }),
    ).toBeInTheDocument();
  });
});

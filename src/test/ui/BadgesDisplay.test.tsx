import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import { BadgesDisplay } from "@/components/BadgesDisplay";

describe("BadgesDisplay UI (BDD 25.1–25.2)", () => {
  it("25.1: renders all 5 badges", () => {
    render(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("First Steps")).toBeInTheDocument();
    expect(screen.getByText("Agile Mindset")).toBeInTheDocument();
    expect(screen.getByText("Teammate")).toBeInTheDocument();
    expect(screen.getByText("Observer")).toBeInTheDocument();
    expect(screen.getByText("Contributor")).toBeInTheDocument();
  });

  it("25.1: shows 0/5 when no badges earned", () => {
    render(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("(0/5)")).toBeInTheDocument();
  });

  it("25.1: shows 1/5 when first steps done", () => {
    render(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("(1/5)")).toBeInTheDocument();
  });

  it("25.1: shows 2/5 when both done", () => {
    render(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={true} />);
    expect(screen.getByText("(2/5)")).toBeInTheDocument();
  });

  it("25.2: earned badge shows description, locked shows 'Locked'", () => {
    render(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("Completed onboarding checklist")).toBeInTheDocument();
    // Locked badges show "Locked" on desktop
    const lockedTexts = screen.getAllByText("Locked");
    expect(lockedTexts.length).toBeGreaterThanOrEqual(3); // Teammate, Observer, Contributor, Agile
  });

  it("25.2: renders badge images with alt text", () => {
    render(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(5);
    images.forEach((img) => {
      expect(img).toHaveAttribute("alt");
    });
  });
});

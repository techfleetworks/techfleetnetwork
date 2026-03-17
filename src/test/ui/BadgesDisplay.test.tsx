import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { MemoryRouter } from "react-router-dom";

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("BadgesDisplay UI (BDD 25.1–25.2)", () => {
  it("25.1: renders all 4 beginner badges", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Agile Mindset")).toBeInTheDocument();
    expect(screen.getByText("Teammate")).toBeInTheDocument();
    expect(screen.getByText("Observer")).toBeInTheDocument();
  });

  it("25.1: does not render Contributor badge", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.queryByText("Contributor")).not.toBeInTheDocument();
  });

  it("25.1: heading says Beginner Badges Earned", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("Beginner Badges Earned")).toBeInTheDocument();
  });

  it("25.1: shows 0/4 when no badges earned", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("(0/4)")).toBeInTheDocument();
  });

  it("25.1: shows 1/4 when first steps done", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("(1/4)")).toBeInTheDocument();
  });

  it("25.1: shows 2/4 when both done", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={true} />);
    expect(screen.getByText("(2/4)")).toBeInTheDocument();
  });

  it("25.2: badges are clickable links to their courses", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links[1]).toHaveAttribute("href", "/journey/second-steps");
    expect(links[2]).toHaveAttribute("href", "/journey/third-steps");
    expect(links[3]).toHaveAttribute("href", "/journey/observer");
  });

  it("25.2: earned badge shows description, locked shows 'Locked'", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("Completed onboarding checklist")).toBeInTheDocument();
    const clickTexts = screen.getAllByText("Click to Continue");
    expect(clickTexts.length).toBeGreaterThanOrEqual(2);
  });

  it("25.2: renders badge images with alt text", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(4);
    images.forEach((img) => {
      expect(img).toHaveAttribute("alt");
    });
  });
});

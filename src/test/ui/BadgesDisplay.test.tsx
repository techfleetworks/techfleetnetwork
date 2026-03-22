import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { MemoryRouter } from "react-router-dom";

const renderWithRouter = (ui: React.ReactElement) =>
  render(<MemoryRouter>{ui}</MemoryRouter>);

describe("BadgesDisplay UI (BDD 25.1–25.2)", () => {
  it("25.1: renders all 6 core badges", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Agile Mindset")).toBeInTheDocument();
    expect(screen.getByText("Discord Learning")).toBeInTheDocument();
    expect(screen.getByText("Cross-Functional")).toBeInTheDocument();
    expect(screen.getByText("Project Training")).toBeInTheDocument();
    expect(screen.getByText("Volunteer")).toBeInTheDocument();
  });

  it("25.1: heading says Core Badges Earned", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("Core Badges Earned")).toBeInTheDocument();
  });

  it("25.1: shows 0/6 when no badges earned", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    expect(screen.getByText("(0/6)")).toBeInTheDocument();
  });

  it("25.1: shows 1/6 when first steps done", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("(1/6)")).toBeInTheDocument();
  });

  it("25.1: shows 3/6 when three courses done", () => {
    renderWithRouter(
      <BadgesDisplay
        allFirstStepsDone={true}
        allSecondStepsDone={true}
        allDiscordDone={true}
        allThirdStepsDone={false}
      />
    );
    expect(screen.getByText("(3/6)")).toBeInTheDocument();
  });

  it("25.2: badges are clickable links to their courses", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/courses/onboarding");
    expect(links[1]).toHaveAttribute("href", "/courses/agile-mindset");
    expect(links[2]).toHaveAttribute("href", "/courses/discord-learning");
    expect(links[3]).toHaveAttribute("href", "/courses/agile-teamwork");
    expect(links[4]).toHaveAttribute("href", "/courses/project-training");
    expect(links[5]).toHaveAttribute("href", "/courses/volunteer-teams");
  });

  it("25.2: earned badge shows description, locked shows 'Click to Continue'", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={true} allSecondStepsDone={false} />);
    expect(screen.getByText("Completed onboarding checklist")).toBeInTheDocument();
    const clickTexts = screen.getAllByText("Click to Continue");
    expect(clickTexts.length).toBeGreaterThanOrEqual(4);
  });

  it("25.2: renders badge images with alt text", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(6);
    images.forEach((img) => {
      expect(img).toHaveAttribute("alt");
    });
  });

  it("25.1: badge names do not include the word 'Badge'", () => {
    renderWithRouter(<BadgesDisplay allFirstStepsDone={false} allSecondStepsDone={false} />);
    const badgeNames = ["Onboarding", "Agile Mindset", "Discord Learning", "Cross-Functional", "Project Training", "Volunteer"];
    badgeNames.forEach((name) => {
      expect(screen.getByText(name)).toBeInTheDocument();
    });
    // None of the displayed badge names should contain "Badge"
    const allText = screen.getAllByRole("link").map((el) => el.textContent);
    allText.forEach((text) => {
      expect(text).not.toContain("Badge");
    });
  });
});

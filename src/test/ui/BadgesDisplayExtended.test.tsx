import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BadgesDisplay } from "@/components/BadgesDisplay";
import { MemoryRouter } from "react-router-dom";

// Mock badge images
vi.mock("@/assets/badge-first-steps.png", () => ({ default: "/badge-first.png" }));
vi.mock("@/assets/badge-second-steps.png", () => ({ default: "/badge-second.png" }));
vi.mock("@/assets/badge-discord-learning.png", () => ({ default: "/badge-discord.png" }));
vi.mock("@/assets/badge-third-steps.png", () => ({ default: "/badge-third.png" }));
vi.mock("@/assets/badge-project-training.png", () => ({ default: "/badge-project.png" }));
vi.mock("@/assets/badge-volunteer.png", () => ({ default: "/badge-volunteer.png" }));

const renderBadges = (props: Partial<Parameters<typeof BadgesDisplay>[0]> = {}) =>
  render(
    <MemoryRouter>
      <BadgesDisplay
        allFirstStepsDone={false}
        allSecondStepsDone={false}
        {...props}
      />
    </MemoryRouter>
  );

describe("BadgesDisplay — BDD 31.x (Dashboard Badge Display)", () => {
  // BDD 31.1: Badges section appears at top of dashboard
  it("renders the badges section with heading", () => {
    renderBadges();
    expect(screen.getByText("Core Badges Earned")).toBeInTheDocument();
  });

  it("shows earned count out of total", () => {
    renderBadges({ allFirstStepsDone: true, allSecondStepsDone: true });
    expect(screen.getByText("(2/6)")).toBeInTheDocument();
  });

  // BDD 31.2: Community badge count is displayed below badges
  it("displays community badge count when provided", () => {
    renderBadges({ communityBadgeCount: 42 });
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(/badges earned across all Tech Fleet members/)).toBeInTheDocument();
  });

  it("hides community badge count when null", () => {
    renderBadges({ communityBadgeCount: null });
    expect(screen.queryByText(/badges earned across all/)).not.toBeInTheDocument();
  });

  // BDD 31.3: Community badge count sums first and second steps completions
  it("formats large community badge counts with locale", () => {
    renderBadges({ communityBadgeCount: 1234 });
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  // Visual: earned badges are not greyed out, unearned are
  it("applies grayscale to unearned badges", () => {
    renderBadges({ allFirstStepsDone: true });
    const earnedImg = screen.getByAltText("Onboarding");
    const unearnedImg = screen.getByAltText("Agile Mindset");

    const earnedWrapper = earnedImg.closest("div");
    const unearnedWrapper = unearnedImg.closest("div");

    expect(earnedWrapper?.className).toContain("drop-shadow");
    expect(unearnedWrapper?.className).toContain("grayscale");
  });

  it("shows 'Click to Continue' for unearned badges", () => {
    renderBadges();
    const clickLabels = screen.getAllByText("Click to Continue");
    expect(clickLabels.length).toBe(6);
  });

  it("singular 'badge' when communityBadgeCount is 1", () => {
    renderBadges({ communityBadgeCount: 1 });
    expect(screen.getByText(/badge earned across/)).toBeInTheDocument();
  });
});

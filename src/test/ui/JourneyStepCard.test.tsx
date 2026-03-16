import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import { JourneyStepCard, type JourneyStep } from "@/components/JourneyStepCard";

const completedStep: JourneyStep = {
  id: "first-steps",
  title: "First Steps",
  description: "Set up your profile and complete onboarding.",
  status: "completed",
  href: "/journey/first-steps",
};

const currentStep: JourneyStep = {
  id: "second-steps",
  title: "Second Steps",
  description: "Complete the Agile Handbook course.",
  status: "current",
  href: "/journey/second-steps",
};

const lockedStep: JourneyStep = {
  id: "observer",
  title: "Observer Phase",
  description: "Complete a 2-week observation period.",
  status: "locked",
  href: "/journey/observer",
};

describe("JourneyStepCard UI (BDD 24.1–24.3)", () => {
  it("24.1: completed step renders title and Completed badge", () => {
    renderWithRouter(<JourneyStepCard step={completedStep} index={0} />);
    expect(screen.getByText("First Steps")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("24.1: completed step is a clickable link", () => {
    renderWithRouter(<JourneyStepCard step={completedStep} index={0} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/journey/first-steps");
  });

  it("24.2: current step shows In Progress badge", () => {
    renderWithRouter(<JourneyStepCard step={currentStep} index={1} />);
    expect(screen.getByText("In Progress")).toBeInTheDocument();
  });

  it("24.2: current step is a clickable link", () => {
    renderWithRouter(<JourneyStepCard step={currentStep} index={1} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/journey/second-steps");
  });

  it("24.3: locked step shows Locked badge", () => {
    renderWithRouter(<JourneyStepCard step={lockedStep} index={3} />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("24.3: locked step is NOT a link", () => {
    renderWithRouter(<JourneyStepCard step={lockedStep} index={3} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders step number", () => {
    renderWithRouter(<JourneyStepCard step={completedStep} index={0} />);
    expect(screen.getByText("Step 1")).toBeInTheDocument();
  });
});

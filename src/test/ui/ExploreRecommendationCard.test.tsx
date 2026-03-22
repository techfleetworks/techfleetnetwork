import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ExploreRecommendationCard from "@/components/resources/ExploreRecommendationCard";

describe("ExploreRecommendationCard (BDD 27.1–27.4)", () => {
  const baseProps = {
    title: "Agile Handbook",
    type: "user guide" as const,
    description: "A comprehensive guide.",
    reason: "This helps you learn agile.",
    link: "https://example.com",
  };

  it("27.1: renders title, type badge, description, and reason", () => {
    render(<ExploreRecommendationCard {...baseProps} />);
    expect(screen.getByText("Agile Handbook")).toBeInTheDocument();
    expect(screen.getByText("user guide")).toBeInTheDocument();
    expect(screen.getByText("A comprehensive guide.")).toBeInTheDocument();
    expect(screen.getByText("This helps you learn agile.")).toBeInTheDocument();
  });

  it("27.2: renders external link when provided", () => {
    render(<ExploreRecommendationCard {...baseProps} />);
    const link = screen.getByRole("link", { name: /open agile handbook/i });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("27.3: hides link when not provided", () => {
    render(<ExploreRecommendationCard {...baseProps} link={undefined} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("27.4: applies correct badge style for type", () => {
    render(<ExploreRecommendationCard {...baseProps} type="course" />);
    expect(screen.getByText("course")).toBeInTheDocument();
  });
});

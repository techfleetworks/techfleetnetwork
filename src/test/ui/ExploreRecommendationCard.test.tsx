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

  it("27.1: renders title, description, and reason (no category badge)", () => {
    render(<ExploreRecommendationCard {...baseProps} />);
    expect(screen.getByText("Agile Handbook")).toBeInTheDocument();
    expect(screen.getByText("A comprehensive guide.")).toBeInTheDocument();
    expect(screen.getByText("This helps you learn agile.")).toBeInTheDocument();
    // Category badge should NOT be present
    expect(screen.queryByText("user guide")).not.toBeInTheDocument();
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

  it("27.33: no category badge is rendered", () => {
    render(<ExploreRecommendationCard {...baseProps} type="course" />);
    expect(screen.queryByText("course")).not.toBeInTheDocument();
  });

  it("27.41: online type shows Online badge and Visit Source link", () => {
    render(
      <ExploreRecommendationCard
        title="MDN Web Docs"
        type="online"
        description="Web development resources."
        reason=""
        link="https://developer.mozilla.org"
      />
    );
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("Visit Source")).toBeInTheDocument();
    // Should NOT show "Why We Recommend" section
    expect(screen.queryByText(/Why We Recommend/)).not.toBeInTheDocument();
  });
});

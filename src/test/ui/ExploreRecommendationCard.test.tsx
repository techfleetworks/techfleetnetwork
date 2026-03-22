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

  it("27.1: renders title, description, reason, and type badge", () => {
    render(<ExploreRecommendationCard {...baseProps} />);
    expect(screen.getByText("Agile Handbook")).toBeInTheDocument();
    expect(screen.getByText("A comprehensive guide.")).toBeInTheDocument();
    expect(screen.getByText("This helps you learn agile.")).toBeInTheDocument();
    expect(screen.getByText("user guide")).toBeInTheDocument();
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

  it("27.33: type badge is rendered for course type", () => {
    render(<ExploreRecommendationCard {...baseProps} type="course" />);
    expect(screen.getByText("course")).toBeInTheDocument();
  });

  it("27.34: type badge is rendered for template type", () => {
    render(<ExploreRecommendationCard {...baseProps} type="template" />);
    expect(screen.getByText("template")).toBeInTheDocument();
  });

  it("27.35: type badge is rendered for project type", () => {
    render(<ExploreRecommendationCard {...baseProps} type="project" />);
    expect(screen.getByText("project")).toBeInTheDocument();
  });

  it("27.41: web type shows Web badge, Visit Source link, and hides Why We Recommend", () => {
    render(
      <ExploreRecommendationCard
        title="MDN Web Docs"
        type="web"
        description="Web development resources."
        reason=""
        link="https://developer.mozilla.org"
      />
    );
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("Visit Source")).toBeInTheDocument();
    expect(screen.queryByText(/Why We Recommend/)).not.toBeInTheDocument();
  });
});

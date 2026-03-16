import { describe, it, expect } from "vitest";
import { screen, render } from "@testing-library/react";
import ResourceDetailPanel from "@/components/resources/ResourceDetailPanel";

describe("ResourceDetailPanel UI (BDD 28.1–28.2)", () => {
  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: "Agile Handbook",
    category: "Operations",
    categoryColorClass: "text-blue-500",
    fields: [
      { label: "Description", value: "A guide to agile." },
      { label: "Target Audience", value: "All members" },
      { label: "Empty Field", value: undefined },
      { label: "Empty Array", value: [] as string[] },
      { label: "Tags", value: ["Agile", "Scrum"] },
    ],
  };

  it("28.1: renders title and category badge", () => {
    render(<ResourceDetailPanel {...baseProps} />);
    expect(screen.getByText("Agile Handbook")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("28.1: renders fields with values, hides empty fields", () => {
    render(<ResourceDetailPanel {...baseProps} />);
    expect(screen.getByText("A guide to agile.")).toBeInTheDocument();
    expect(screen.getByText("All members")).toBeInTheDocument();
    expect(screen.queryByText("Empty Field")).not.toBeInTheDocument();
    expect(screen.queryByText("Empty Array")).not.toBeInTheDocument();
  });

  it("28.1: renders array fields as badges", () => {
    render(<ResourceDetailPanel {...baseProps} />);
    expect(screen.getByText("Agile")).toBeInTheDocument();
    expect(screen.getByText("Scrum")).toBeInTheDocument();
  });

  it("28.2: renders external link button when provided", () => {
    render(
      <ResourceDetailPanel
        {...baseProps}
        externalLink="https://example.com"
        externalLinkLabel="Read Handbook"
      />
    );
    expect(screen.getByText("Read Handbook")).toBeInTheDocument();
  });

  it("28.2: does not render external link when not provided", () => {
    render(<ResourceDetailPanel {...baseProps} />);
    expect(screen.queryByText("Open Resource")).not.toBeInTheDocument();
  });
});

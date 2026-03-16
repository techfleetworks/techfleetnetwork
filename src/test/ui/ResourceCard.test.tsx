import { describe, it, expect, vi } from "vitest";
import { screen, render, fireEvent } from "@testing-library/react";
import ResourceCard from "@/components/resources/ResourceCard";

describe("ResourceCard UI (BDD 26.1–26.2)", () => {
  const props = {
    name: "Agile Handbook",
    category: "Operations",
    categoryColorClass: "text-blue-500",
    description: "A comprehensive guide to agile practices.",
    onView: vi.fn(),
  };

  it("26.1: renders name, category badge, description, and View button", () => {
    render(<ResourceCard {...props} />);
    expect(screen.getByText("Agile Handbook")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
    expect(screen.getByText("A comprehensive guide to agile practices.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
  });

  it("26.2: View button triggers onView callback", () => {
    render(<ResourceCard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /view/i }));
    expect(props.onView).toHaveBeenCalledTimes(1);
  });
});

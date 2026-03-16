import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import LandingPage from "@/pages/LandingPage";

// Mock NetworkActivity (requires Supabase)
vi.mock("@/components/NetworkActivity", () => ({
  NetworkActivity: () => <div data-testid="network-activity">Network Activity</div>,
}));

describe("LandingPage UI (BDD 16.1–16.4)", () => {
  beforeEach(() => {
    renderWithRouter(<LandingPage />);
  });

  it("16.1: renders hero heading with keyword", () => {
    expect(screen.getByText(/develop the skills and mindset for/i)).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
  });

  it("16.1: renders Get Started CTA linking to /register", () => {
    const link = screen.getAllByRole("link").find((l) => l.textContent?.includes("Get Started"));
    expect(link).toBeTruthy();
    expect(link).toHaveAttribute("href", "/register");
  });

  it("16.1: renders Training Overview external link", () => {
    const link = screen.getByRole("link", { name: /training overview/i });
    expect(link).toHaveAttribute("href", "https://techfleet.org/overview");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("16.2: renders 6 feature cards", () => {
    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(6);
  });

  it("16.2: feature cards have titles", () => {
    expect(screen.getByText("Guided Onboarding")).toBeInTheDocument();
    expect(screen.getByText("Tiered Training")).toBeInTheDocument();
    expect(screen.getByText("Real Team Projects")).toBeInTheDocument();
    expect(screen.getByText("Growth Paths")).toBeInTheDocument();
    expect(screen.getByText("Track Accomplishments")).toBeInTheDocument();
    expect(screen.getByText("Community Support")).toBeInTheDocument();
  });

  it("16.3: renders bottom CTA section", () => {
    expect(screen.getByText("Ready to start your journey?")).toBeInTheDocument();
  });

  it("16.4: hero image has descriptive alt text", () => {
    const img = screen.getByRole("img", { name: /astronaut/i });
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("alt")!.length).toBeGreaterThan(20);
  });
});

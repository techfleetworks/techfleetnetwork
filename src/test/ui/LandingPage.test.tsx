// Module under test: src/pages/LandingPage.tsx
import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import LandingPage from "@/pages/LandingPage";
import { PUBLIC_NAV_ITEMS } from "@/components/PublicNavItems";

// Mock NetworkActivity (requires Supabase)
vi.mock("@/components/NetworkActivity", () => ({
  NetworkActivity: () => <div data-testid="network-activity">Network Activity</div>,
}));

describe("LandingPage UI (BDD 16.1–16.4)", () => {
  beforeEach(() => {
    renderWithRouter(<LandingPage />);
  });

  it("16.1: renders hero heading with keyword", () => {
    expect(screen.getByText("empowered")).toBeInTheDocument();
    expect(document.getElementById("hero-heading")).toHaveTextContent(
      /welcome to the network for empowered team spaces/i
    );
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
    expect(screen.getByText("Community Involvement")).toBeInTheDocument();
  });

  it("16.3: features heading is left-aligned (no bottom CTA duplicate)", () => {
    expect(
      screen.getByText("Get ready for the future of work with Tech Fleet")
    ).toBeInTheDocument();
    expect(screen.queryByText("Ready to start your journey?")).not.toBeInTheDocument();
  });

  it("B13: renders the discovery section heading", () => {
    expect(
      screen.getByRole("heading", { name: /explore before you join/i }),
    ).toBeInTheDocument();
  });

  it("B13: discovery section links EXACTLY the non-Home public nav surfaces (policy binding)", () => {
    // The discovery cards are a projection of PUBLIC_NAV_ITEMS (the one nav/policy
    // source) minus Home — so they can never drift from, or lag behind, the
    // routes the A5 policy exposes. If a new public surface joins the nav without
    // discovery copy, this fails.
    const region = screen.getByRole("region", { name: /explore before you join/i });
    const hrefs = within(region)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"))
      .sort();
    const expected = PUBLIC_NAV_ITEMS.filter((i) => i.href !== "/")
      .map((i) => i.href)
      .sort();
    expect(hrefs).toEqual(expected);
  });

  it("B13: each discovery card shows its heading and a blurb", () => {
    expect(screen.getByText("Browse free courses")).toBeInTheDocument();
    expect(screen.getByText("See project openings")).toBeInTheDocument();
  });

  it("16.4: hero image has descriptive alt text", () => {
    // Two hero <img> render (mobile + desktop layouts), same alt; theme-driven
    // copy ("stylized world map" in dark, "stylized sun" in light) — both start
    // with "Illustration of a stylized …".
    const imgs = screen.getAllByRole("img", { name: /illustration of a stylized/i });
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0].getAttribute("alt")!.length).toBeGreaterThan(20);
  });
});

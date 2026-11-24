import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import { AppLayout } from "@/components/AppLayout";
import { ThemeProvider } from "@/components/ThemeProvider";

// Mock auth context to logged-out state
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    profileLoaded: true,
    signOut: vi.fn(),
  }),
}));

function renderLayout() {
  return renderWithRouter(
    <ThemeProvider defaultTheme="dark">
      <AppLayout>
        <div data-testid="child">Content</div>
      </AppLayout>
    </ThemeProvider>
  );
}

describe("AppLayout / Navigation UI (BDD 22.1–22.4)", () => {
  beforeEach(() => {
    renderLayout();
  });

  it("22.1: renders Tech Fleet logo", () => {
    const logos = screen.getAllByAltText(/tech fleet/i);
    expect(logos.length).toBeGreaterThan(0);
  });

  it("22.1: renders theme toggle", () => {
    expect(screen.getByLabelText(/toggle theme/i)).toBeInTheDocument();
  });

  it("22.2 (B8): Sign In + Join Platform CTAs visible when logged out", () => {
    expect(screen.getByRole("button", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join Platform" })).toBeInTheDocument();
    // The old single "Connect" CTA is gone.
    expect(screen.queryByText("Connect")).not.toBeInTheDocument();
  });

  it("B8/B11: the logged-out nav shows the public items (Home, Courses, Project Openings)", () => {
    expect(screen.getByRole("link", { name: /courses/i })).toBeInTheDocument();
    // Project Openings joined the anon nav in B11 (2026-11-24) when the public
    // openings list shipped; before that it was viewable-by-link but not surfaced.
    expect(screen.getByRole("link", { name: /project openings/i })).toBeInTheDocument();
  });

  it("B8 @security: authed-only nav items are NOT rendered for an anonymous visitor", () => {
    // These belong to the authenticated sidebar (Community / Training / Admin) and
    // must never appear in the logged-out shell.
    for (const authedOnly of [/announcements/i, /my journey/i, /applications/i, /recruiting center/i, /user admin/i]) {
      expect(screen.queryByRole("link", { name: authedOnly })).not.toBeInTheDocument();
    }
  });

  it("B8: Sign In carries a redirect-back to the current page", () => {
    const signIn = screen.getByRole("button", { name: "Sign In" }).closest("a");
    expect(signIn?.getAttribute("href")).toContain("/login?redirect=");
  });

  it("22.3: footer renders copyright text", () => {
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(`© ${year}`))).toBeInTheDocument();
  });

  it("22.3: footer has techfleet.org link", () => {
    expect(screen.getByRole("link", { name: "techfleet.org" })).toHaveAttribute(
      "href",
      "https://techfleet.org"
    );
  });

  it("22.3: footer has external techfleet.org link", () => {
    const websiteLinks = screen.getAllByRole("link", { name: "techfleet.org" });
    expect(websiteLinks.some((l) => l.getAttribute("href") === "https://techfleet.org")).toBe(true);
  });

  it("22.4: skip to main content link exists", () => {
    expect(screen.getByText(/skip to main content/i)).toBeInTheDocument();
  });

  it("renders children in main area", () => {
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

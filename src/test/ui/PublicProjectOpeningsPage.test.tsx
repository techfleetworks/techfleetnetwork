// B11: PublicProjectOpeningsPage — the logged-out project-openings catalog at
// /project-openings. The edge-fn hook is mocked; the behavior under test is
// "renders the right tiles (team-hat chips, status) with auth-aware CTAs, orders
// open-first, and shows FR-8 empty/error states".
// Module under test: src/pages/PublicProjectOpeningsPage.tsx
// Feature spec: src/pages/public-project-openings.feature
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import PublicProjectOpeningsPage from "@/pages/PublicProjectOpeningsPage";
import { usePublicProjectOpenings, type PublicProjectOpening } from "@/hooks/use-public-catalog";

vi.mock("@/hooks/use-public-catalog", async (importActual) => ({
  ...(await importActual<typeof import("@/hooks/use-public-catalog")>()),
  usePublicProjectOpenings: vi.fn(),
}));

const state = <T,>(over: Partial<{ data: T; isLoading: boolean; isError: boolean }>) =>
  ({ data: undefined, isLoading: false, isError: false, ...over }) as any;

function opening(over: Partial<PublicProjectOpening> = {}): PublicProjectOpening {
  return {
    id: "p1",
    client_id: "cl1",
    project_type: "web_app",
    project_status: "apply_now",
    team_hats: ["UX Design", "Development"],
    current_phase_milestones: ["Discovery"],
    friendly_name: "Trailhead Redesign",
    description: "Rebuild the volunteer onboarding flow.",
    is_shipathon: false,
    created_at: "2026-11-01T00:00:00Z",
    client: { id: "cl1", name: "Acme Nonprofit", logo_url: null },
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(usePublicProjectOpenings).mockReturnValue(state({ data: [opening()] }));
});

describe("PublicProjectOpeningsPage (B11)", () => {
  it("renders the heading", () => {
    renderWithRouter(<PublicProjectOpeningsPage />);
    expect(screen.getByRole("heading", { name: "Project Openings" })).toBeInTheDocument();
  });

  it("shows an opening tile with its title, team-hat chips and status", () => {
    renderWithRouter(<PublicProjectOpeningsPage />);
    expect(screen.getByText("Trailhead Redesign")).toBeInTheDocument();
    expect(screen.getByText("UX Design")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
    // apply_now → the canonical "Accepting Applications" label.
    expect(screen.getByText("Accepting Applications")).toBeInTheDocument();
  });

  it("links View opening to the public detail page and Join Platform back to that opening", () => {
    renderWithRouter(<PublicProjectOpeningsPage />);
    const view = screen.getByRole("link", { name: /View the Trailhead Redesign opening/i });
    expect(view).toHaveAttribute("href", "/project-openings/p1");
    const links = screen.getAllByRole("link");
    expect(
      links.some((a) => a.getAttribute("href") === "/login?redirect=%2Fproject-openings%2Fp1"),
    ).toBe(true);
  });

  it("DISCRIMINATING: the Join target is the specific opening, not the generic list", () => {
    // Guards against a copy-paste that sends every tile to /project-openings.
    renderWithRouter(<PublicProjectOpeningsPage />);
    const links = screen.getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === "/login?redirect=%2Fproject-openings%2Fp1")).toBe(true);
    expect(links.every((a) => a.getAttribute("href") !== "/login?redirect=%2Fproject-openings")).toBe(true);
  });

  it("falls back to the client name when a project has no friendly_name", () => {
    vi.mocked(usePublicProjectOpenings).mockReturnValue(
      state({ data: [opening({ friendly_name: null })] }),
    );
    renderWithRouter(<PublicProjectOpeningsPage />);
    expect(screen.getByRole("heading", { name: "Acme Nonprofit" })).toBeInTheDocument();
  });

  it("orders accepting-applications before opening-soon (acts-now first)", () => {
    vi.mocked(usePublicProjectOpenings).mockReturnValue(
      state({
        data: [
          opening({ id: "soon", project_status: "coming_soon", friendly_name: "Soon Project" }),
          opening({ id: "now", project_status: "apply_now", friendly_name: "Now Project" }),
        ],
      }),
    );
    renderWithRouter(<PublicProjectOpeningsPage />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles.indexOf("Now Project")).toBeLessThan(titles.indexOf("Soon Project"));
  });

  it("shows an empty state with a Join Platform CTA when there are no openings", () => {
    vi.mocked(usePublicProjectOpenings).mockReturnValue(state({ data: [] }));
    renderWithRouter(<PublicProjectOpeningsPage />);
    expect(screen.getByText(/no open projects right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Join Platform/i })).toBeInTheDocument();
  });

  it("shows an error state with a Join Platform CTA when the gateway fails", () => {
    vi.mocked(usePublicProjectOpenings).mockReturnValue(state({ isError: true }));
    renderWithRouter(<PublicProjectOpeningsPage />);
    expect(screen.getByText(/could not load this right now/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Join Platform/i })).toBeInTheDocument();
  });
});

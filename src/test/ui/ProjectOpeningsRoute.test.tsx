// /project-openings is one URL for everyone (B11): a signed-in member gets the
// member ProjectOpeningsPage, an anonymous visitor gets PublicProjectOpeningsPage,
// and the auth-loading state shows a spinner. The decision lives in
// ProjectOpeningsRoute (not inside either page), so this tests that boundary
// directly with both pages and useAuth mocked. Mirrors CoursesRoute (B10).
// Module under test: src/pages/ProjectOpeningsRoute.tsx
import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProjectOpeningsRoute from "@/pages/ProjectOpeningsRoute";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
// Keep the two lazy chunks out of this unit: mock them to tiny markers so the
// test asserts only which branch the route renders, not the pages themselves.
vi.mock("@/pages/ProjectOpeningsPage", () => ({
  default: () => <div>MEMBER_OPENINGS_PAGE</div>,
}));
vi.mock("@/pages/PublicProjectOpeningsPage", () => ({
  default: () => <div>PUBLIC_OPENINGS_PAGE</div>,
}));

const renderRoute = () =>
  render(
    <MemoryRouter>
      <Suspense fallback={<div>SUSPENSE_FALLBACK</div>}>
        <ProjectOpeningsRoute />
      </Suspense>
    </MemoryRouter>,
  );

describe("ProjectOpeningsRoute — single-URL auth branch (B11)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading spinner while auth is resolving", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as any);
    renderRoute();
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC_OPENINGS_PAGE")).not.toBeInTheDocument();
    expect(screen.queryByText("MEMBER_OPENINGS_PAGE")).not.toBeInTheDocument();
  });

  it("renders the public openings catalog for an anonymous visitor", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as any);
    renderRoute();
    expect(await screen.findByText("PUBLIC_OPENINGS_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("MEMBER_OPENINGS_PAGE")).not.toBeInTheDocument();
  });

  it("renders the member openings page for a signed-in user (protection preserved)", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1" }, loading: false } as any);
    renderRoute();
    expect(await screen.findByText("MEMBER_OPENINGS_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC_OPENINGS_PAGE")).not.toBeInTheDocument();
  });
});

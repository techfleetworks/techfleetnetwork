// /courses is one URL for everyone: a signed-in member gets TrainingPage, an
// anonymous visitor gets PublicCoursesPage, and the auth-loading state shows a
// spinner. The decision lives in CoursesRoute (not inside either page), so this
// tests that boundary directly with both pages and useAuth mocked.
// Module under test: src/pages/CoursesRoute.tsx
import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CoursesRoute from "@/pages/CoursesRoute";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
// Keep the two lazy chunks out of this unit: mock them to tiny markers so the
// test asserts only which branch CoursesRoute renders, not the pages themselves.
vi.mock("@/pages/TrainingPage", () => ({
  default: () => <div>MEMBER_TRAINING_PAGE</div>,
}));
vi.mock("@/pages/PublicCoursesPage", () => ({
  default: () => <div>PUBLIC_CATALOG_PAGE</div>,
}));

const renderRoute = () =>
  render(
    <MemoryRouter>
      <Suspense fallback={<div>SUSPENSE_FALLBACK</div>}>
        <CoursesRoute />
      </Suspense>
    </MemoryRouter>,
  );

describe("CoursesRoute — single-URL auth branch", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a loading spinner while auth is resolving", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as any);
    renderRoute();
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC_CATALOG_PAGE")).not.toBeInTheDocument();
    expect(screen.queryByText("MEMBER_TRAINING_PAGE")).not.toBeInTheDocument();
  });

  it("renders the public catalog for an anonymous visitor", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as any);
    renderRoute();
    expect(await screen.findByText("PUBLIC_CATALOG_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("MEMBER_TRAINING_PAGE")).not.toBeInTheDocument();
  });

  it("renders the member training page for a signed-in user", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { id: "u1" }, loading: false } as any);
    renderRoute();
    expect(await screen.findByText("MEMBER_TRAINING_PAGE")).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC_CATALOG_PAGE")).not.toBeInTheDocument();
  });
});

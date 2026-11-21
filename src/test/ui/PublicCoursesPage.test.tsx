// B10: PublicCoursesPage — the logged-out catalog at /courses.
// The edge-fn hooks are mocked; the behavior under test is "renders the right
// tiles with auth-aware CTAs and empty states".
// Module under test: src/pages/PublicCoursesPage.tsx
// Feature spec: src/pages/public-classes.feature
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithRouter } from "./test-utils";
import PublicCoursesPage from "@/pages/PublicCoursesPage";
import { usePublicCourses, usePublicClasses } from "@/hooks/use-public-catalog";

vi.mock("@/hooks/use-public-catalog", async (importActual) => ({
  ...(await importActual<typeof import("@/hooks/use-public-catalog")>()),
  usePublicCourses: vi.fn(),
  usePublicClasses: vi.fn(),
}));

const ok = <T,>(data: T) => ({ data, isLoading: false, isError: false }) as any;

const course = {
  course_key: "agile-mindset",
  display_label: "Build an Agile Mindset",
  display_order: 1,
  phase: null,
  tier: "core",
  lessons: [{ lesson_id: "l1", course_key: "agile-mindset", display_order: 1, required: true }],
};

const basicClass = {
  id: "c1",
  slug: "design-foundations",
  title: "Design Foundations",
  summary: "Learn the basics of product design.",
  description: null,
  track: "basic_training" as const,
  hero_image_url: null,
  outcomes: null,
  skills: null,
  prerequisites: null,
  published_at: null,
  cohorts: [
    {
      id: "co1",
      label: "Winter",
      start_date: "2026-03-03",
      end_date: "2026-04-03",
      registration_url: "https://gum.co/x",
      registration_status: "register_now" as const,
    },
  ],
};

beforeEach(() => {
  vi.mocked(usePublicCourses).mockReturnValue(ok([course]));
  vi.mocked(usePublicClasses).mockImplementation((track?: string) =>
    track === "basic_training" ? ok([basicClass]) : ok([]),
  );
});

describe("PublicCoursesPage (B10)", () => {
  it("renders the heading and the three catalog tabs", () => {
    renderWithRouter(<PublicCoursesPage />);
    expect(screen.getByRole("heading", { name: "Courses" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Onboarding Courses/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Basic Training/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Advanced Training/i })).toBeInTheDocument();
  });

  it("shows a free course tile with a Join Platform redirect-back to /courses", () => {
    renderWithRouter(<PublicCoursesPage />);
    expect(screen.getByText("Build an Agile Mindset")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === "/login?redirect=%2Fcourses")).toBe(true);
  });

  it("shows a class tile with View details and a Join Platform redirect-back to the class", () => {
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Basic Training/i }));
    expect(screen.getByText("Design Foundations")).toBeInTheDocument();
    const viewDetails = screen.getByRole("link", { name: /View details for Design Foundations/i });
    expect(viewDetails).toHaveAttribute("href", "/classes/design-foundations");
    const links = screen.getAllByRole("link");
    expect(
      links.some((a) => a.getAttribute("href") === "/login?redirect=%2Fclasses%2Fdesign-foundations"),
    ).toBe(true);
  });

  it("shows an empty state with a Join Platform CTA for a tab with no classes", () => {
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Advanced Training/i }));
    expect(screen.getByText(/Nothing here yet/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Join Platform/i })).toBeInTheDocument();
  });

  it("lists a published class with NO open cohort, shown as 'Enrollment not open'", () => {
    // ADR 20261119: the public catalog matches the authenticated list — a
    // published class appears even with no open cohort (cohorts: []). The badge
    // must then tell the truth (not a misleading "Registration open").
    const noCohort = { ...basicClass, id: "c2", slug: "no-cohort", title: "No Cohort Class", cohorts: [] };
    vi.mocked(usePublicClasses).mockImplementation((track?: string) =>
      track === "basic_training" ? ok([noCohort]) : ok([]),
    );
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Basic Training/i }));
    // The tile renders (not dropped, not the empty state)...
    expect(screen.getByText("No Cohort Class")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/i)).not.toBeInTheDocument();
    // ...with an honest status, NOT "Registration open".
    expect(screen.getByText(/Enrollment not open/i)).toBeInTheDocument();
    expect(screen.queryByText(/Registration open/i)).not.toBeInTheDocument();
  });

  it("shows 'Registration open' for a class with a register_now cohort", () => {
    // Discriminates the status from the no-cohort case above: with a registerable
    // cohort, the success badge is correct and "Enrollment not open" must be absent.
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Basic Training/i }));
    expect(screen.getByText(/Registration open/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enrollment not open/i)).not.toBeInTheDocument();
  });

  it("shows 'Opening soon' for a class whose only cohort is coming_soon", () => {
    // The real prod state (Jan-2027 cohorts, registration_status=coming_soon): the
    // badge reflects the enrollment phase, not a misleading "open" or "not open".
    const soon = {
      ...basicClass,
      id: "c3",
      slug: "soon",
      title: "Soon Class",
      cohorts: [{ ...basicClass.cohorts[0], registration_status: "coming_soon" as const }],
    };
    vi.mocked(usePublicClasses).mockImplementation((track?: string) =>
      track === "basic_training" ? ok([soon]) : ok([]),
    );
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Basic Training/i }));
    expect(screen.getByText("Soon Class")).toBeInTheDocument();
    expect(screen.getByText(/Opening soon/i)).toBeInTheDocument();
    expect(screen.queryByText(/Registration open/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Enrollment not open/i)).not.toBeInTheDocument();
  });

  it("DISCRIMINATING: a class tile's Join target is the class, not the generic /courses", () => {
    // Guards that the redirect-back is the specific class, not a copy-paste of the
    // course tile's /courses target.
    renderWithRouter(<PublicCoursesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Basic Training/i }));
    const links = screen.getAllByRole("link");
    expect(links.some((a) => a.getAttribute("href") === "/login?redirect=%2Fclasses%2Fdesign-foundations")).toBe(true);
    expect(links.every((a) => a.getAttribute("href") !== "/login?redirect=%2Fcourses%2Fdesign-foundations")).toBe(true);
  });
});

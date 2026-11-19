// B10: PublicClassDetailPage — the public class detail at /classes/:slug.
// The detail hook and auth are mocked; the behavior under test is "renders the
// class + schedule, with the correct auth-aware cohort CTA, and a not-found page".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import PublicClassDetailPage from "@/pages/PublicClassDetailPage";
import { usePublicClassDetail } from "@/hooks/use-public-catalog";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/hooks/use-public-catalog", () => ({ usePublicClassDetail: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const res = (over: Record<string, unknown>) =>
  ({ data: undefined, isLoading: false, isError: false, ...over }) as any;

const detail = {
  class: {
    id: "c1",
    slug: "design-foundations",
    track: "basic_training",
    status: "published",
    title: "Design Foundations",
    summary: "Learn product design.",
    description: "A full description.",
    outcomes: ["Build a portfolio"],
    skills: ["Figma"],
    prerequisites: null,
    hero_image_url: null,
    short_description: null,
    deliverables: null,
    curriculum: "Module one",
    published_at: null,
    instructor_name: "Jane Doe",
  },
  cohorts: [
    { id: "co1", label: "Winter cohort", start_date: "2026-03-03", end_date: "2026-04-03", registration_url: "https://gum.co/x" },
  ],
};

function renderAt(authedUser: unknown) {
  vi.mocked(useAuth).mockReturnValue({ user: authedUser } as any);
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={["/classes/design-foundations"]}>
        <Routes>
          <Route path="/classes/:slug" element={<PublicClassDetailPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(usePublicClassDetail).mockReturnValue(res({ data: detail }));
});

describe("PublicClassDetailPage (B10)", () => {
  it("renders the class, instructor and the cohort schedule", () => {
    renderAt(null);
    expect(screen.getByRole("heading", { level: 1, name: "Design Foundations" })).toBeInTheDocument();
    expect(screen.getByText(/Taught by Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText("Learn product design.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Schedule" })).toBeInTheDocument();
    expect(screen.getByText("Winter cohort")).toBeInTheDocument();
  });

  it("sends an anonymous visitor to Join Platform to register (redirect-back)", () => {
    renderAt(null);
    const cta = screen.getByRole("link", { name: /Join Platform to register/i });
    expect(cta).toHaveAttribute("href", "/login?redirect=%2Fclasses%2Fdesign-foundations");
    expect(screen.queryByText(/Register on Gumroad/i)).not.toBeInTheDocument();
  });

  it("gives a signed-in member the external Register-on-Gumroad link", () => {
    renderAt({ id: "u1" });
    const cta = screen.getByRole("link", { name: /Register on Gumroad/i });
    expect(cta).toHaveAttribute("href", "https://gum.co/x");
    expect(cta).toHaveAttribute("target", "_blank");
    expect(cta).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(screen.queryByText(/Join Platform to register/i)).not.toBeInTheDocument();
  });

  it("SECURITY: a non-https registration URL is rejected, not rendered as a link", () => {
    // A teacher/admin-written javascript: URL must never become an href on this
    // public page (safeHref guard). The member sees a disabled CTA instead.
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({
        data: {
          ...detail,
          cohorts: [{ ...detail.cohorts[0], registration_url: "javascript:alert(1)" }],
        },
      }),
    );
    renderAt({ id: "u1" });
    expect(screen.queryByRole("link", { name: /Register on Gumroad/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Registration link unavailable/i)).toBeInTheDocument();
  });

  it("shows a not-found page for an unknown or unpublished class", () => {
    vi.mocked(usePublicClassDetail).mockReturnValue(res({ data: null }));
    renderAt(null);
    expect(screen.getByText(/couldn't find that class/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to courses/i })).toBeInTheDocument();
  });
});

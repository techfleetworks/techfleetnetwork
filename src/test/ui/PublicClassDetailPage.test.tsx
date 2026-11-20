// B10: PublicClassDetailPage — the public class detail at /classes/:slug.
// The detail hook and auth are mocked; the behavior under test is "renders the
// class + schedule, with the correct auth-aware cohort CTA, and a not-found page".
// Module under test: src/pages/PublicClassDetailPage.tsx
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
    // outcomes is a single rich-text STRING (classes.outcomes is a text column),
    // not an array — the old array mock hid the prod crash.
    outcomes: "<p>Build a portfolio</p>",
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
  it("renders the class, instructor byline and the cohort schedule (no 'Schedule' header)", () => {
    renderAt(null);
    expect(screen.getByRole("heading", { level: 1, name: "Design Foundations" })).toBeInTheDocument();
    // Instructor is a styled byline (a <p>, not a heading) so it doesn't skip a
    // heading level between the h1 and the authored h2s.
    const byline = screen.getByText(/Taught by Jane Doe/);
    expect(byline.tagName).toBe("P");
    expect(screen.getByText("Learn product design.")).toBeInTheDocument();
    // The schedule card is self-describing — no "Schedule" heading.
    expect(screen.queryByRole("heading", { name: "Schedule" })).not.toBeInTheDocument();
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

  it("REGRESSION: renders a class whose outcomes is a rich-text string (no crash)", () => {
    // Prod shape that crashed /classes/ai-enabled-product-strategy-learning-lab:
    // outcomes is an HTML string, skills is an array, no cohorts. The page must
    // render it as prose, not call .map on a string.
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({
        data: {
          class: { ...detail.class, outcomes: "<p>Size a market and ship a strategy</p>", skills: ["Strategy"] },
          cohorts: [],
        },
      }),
    );
    renderAt(null);
    expect(screen.getByRole("heading", { level: 1, name: "Design Foundations" })).toBeInTheDocument();
    expect(screen.getByText("Size a market and ship a strategy")).toBeInTheDocument(); // prose, stripped of HTML
    expect(screen.getByRole("heading", { name: "What you'll learn" })).toBeInTheDocument();
  });

  it("DEFENSE IN DEPTH: a malformed non-array list field does not white-screen the page", () => {
    // Even if a future field's hand-written type disagrees with the DB and a
    // non-array reaches ListSection, the page must still render (coerced to empty),
    // not crash into the error boundary.
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({ data: { class: { ...detail.class, skills: "Figma" as unknown as string[] }, cohorts: [] } }),
    );
    renderAt(null);
    expect(screen.getByRole("heading", { level: 1, name: "Design Foundations" })).toBeInTheDocument();
    // The malformed Skills section is dropped rather than throwing.
    expect(screen.queryByRole("heading", { name: "Skills" })).not.toBeInTheDocument();
  });

  it("renders teacher rich-text as structured HTML (authored headings + lists), not a flat blob", () => {
    // The core fix: summary/curriculum are authored HTML. Rendering them preserves
    // the "Overview" heading and the ordered curriculum weeks, instead of stripping
    // tags into one run-on paragraph.
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({
        data: {
          class: {
            ...detail.class,
            summary: "<h2>Overview</h2><p>Research is at the heart of product.</p>",
            curriculum: "<h3>Week 1 - Experiment Design</h3><ol><li>Scientific Method</li></ol>",
          },
          cohorts: [],
        },
      }),
    );
    renderAt(null);
    // The authored "Overview" heading renders as a heading (not jammed into text).
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByText("Research is at the heart of product.")).toBeInTheDocument();
    // Curriculum keeps its week heading and the lesson as a real list item.
    expect(screen.getByRole("heading", { name: /Week 1 - Experiment Design/ })).toBeInTheDocument();
    const lesson = screen.getByText("Scientific Method");
    expect(lesson.tagName).toBe("LI");
  });

  it("SECURITY: active markup in teacher rich-text is sanitized out of the DOM", () => {
    // Rich text is rendered via dangerouslySetInnerHTML, so sanitizeHtml is the
    // control. Proof is that the dangerous NODES never reach the DOM: with the
    // sanitizer removed, raw innerHTML would parse the <script> and <img onerror>
    // into the container, so these queries are what fails-closed. (A <script>
    // injected via innerHTML never executes and jsdom doesn't fetch img src, so a
    // runtime window-flag check would be vacuous — the node assertions are the real
    // test.)
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({
        data: {
          class: {
            ...detail.class,
            summary: '<p>Safe copy.</p><script>const x=1</script><img src=x onerror="document.title=1">',
          },
          cohorts: [],
        },
      }),
    );
    const { container } = renderAt(null);
    expect(screen.getByText("Safe copy.")).toBeInTheDocument(); // the allowed <p> survives
    expect(container.querySelector("script")).toBeNull(); // script node stripped
    expect(container.querySelector("img")).toBeNull(); // img (and its onerror) stripped
    expect(container.querySelector("[onerror]")).toBeNull(); // no event-handler attr survives
  });

  it("renders Skills as pills and Prerequisites as a joined paragraph (not bullets)", () => {
    vi.mocked(usePublicClassDetail).mockReturnValue(
      res({
        data: {
          class: {
            ...detail.class,
            skills: ["Experiment Design", "Statistics"],
            // Stored as sentence fragments; must read as one paragraph, not bullets.
            prerequisites: ["There are no previous activities.", "Bring your own research if you have it."],
          },
          cohorts: [],
        },
      }),
    );
    renderAt(null);
    // Skills are chips, not list items.
    expect(screen.getByText("Experiment Design")).toBeInTheDocument();
    expect(screen.getByText("Statistics")).toBeInTheDocument();
    // Prerequisites are one paragraph (fragments joined with a space), no <li>.
    expect(
      screen.getByText("There are no previous activities. Bring your own research if you have it."),
    ).toBeInTheDocument();
  });

  it("renders How to join as a numbered step sequence", () => {
    renderAt(null);
    expect(screen.getByRole("heading", { name: "How to join" })).toBeInTheDocument();
    expect(screen.getByText("Join the platform")).toBeInTheDocument();
    expect(screen.getByText("Start your class modules")).toBeInTheDocument();
  });

  it("shows a not-found page for an unknown or unpublished class", () => {
    vi.mocked(usePublicClassDetail).mockReturnValue(res({ data: null }));
    renderAt(null);
    expect(screen.getByText(/couldn't find that class/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to courses/i })).toBeInTheDocument();
  });
});

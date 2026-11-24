// Module under test: src/pages/PublicCourseDetailPage.tsx
// B12: PublicCourseDetailPage — the public Core-course detail at /course/:courseKey.
// The catalog feed is mocked; the module/lesson content + takeaways come from the
// REAL course registry (src/data). Behavior: renders modules with Video/Reading and
// a one-sentence takeaway per lesson, a Join CTA, and a not-found page for an
// unknown course.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import PublicCourseDetailPage from "@/pages/PublicCourseDetailPage";
import { usePublicCourses } from "@/hooks/use-public-catalog";
import { LESSON_TAKEAWAYS } from "@/data/public-course-takeaways";

vi.mock("@/hooks/use-public-catalog", () => ({ usePublicCourses: vi.fn() }));

const qres = (over: Record<string, unknown>) =>
  ({ data: undefined, isLoading: false, isError: false, ...over }) as any;

const agileCourse = {
  course_key: "agile-mindset",
  display_label: "Agile Mindset",
  display_order: 1,
  phase: "second_steps",
  tier: "core",
  lessons: [],
};

function renderAt(courseKey: string) {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[`/course/${courseKey}`]}>
        <Routes>
          <Route path="/course/:courseKey" element={<PublicCourseDetailPage />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(usePublicCourses).mockReturnValue(qres({ data: [agileCourse] }));
});

describe("PublicCourseDetailPage (B12)", () => {
  it("renders the course title, module outline, and a Join Platform CTA", () => {
    renderAt("agile-mindset");
    expect(screen.getByRole("heading", { level: 1, name: "Agile Mindset" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you'll cover" })).toBeInTheDocument();
    const join = screen.getByRole("link", { name: /Join Platform/i });
    expect(join).toHaveAttribute("href", "/login?redirect=%2Fcourse%2Fagile-mindset");
  });

  it("renders the big-picture 'This course teaches you ___' summary", () => {
    renderAt("agile-mindset");
    expect(
      screen.getByText(/This course teaches you how to build a mindset of agility/i),
    ).toBeInTheDocument();
  });

  it("shows a Video indicator and the lesson's one-sentence takeaway", () => {
    renderAt("agile-mindset");
    // At least one lesson is a video...
    expect(screen.getAllByText("Video").length).toBeGreaterThan(0);
    // ...and the authored takeaway for the first agile lesson renders verbatim.
    expect(screen.getByText(LESSON_TAKEAWAYS["agile-intro-1"])).toBeInTheDocument();
  });

  it("shows no video length anywhere (the YouTube-duration route was dropped)", () => {
    renderAt("agile-mindset");
    // A mm:ss length string must not appear; the page shows takeaways, not minutes.
    expect(screen.queryByText(/^\d{1,2}:\d{2}$/)).not.toBeInTheDocument();
  });

  it("shows a not-found page for a key not in the public catalog", () => {
    vi.mocked(usePublicCourses).mockReturnValue(qres({ data: [] }));
    renderAt("agile-mindset");
    expect(screen.getByText(/couldn't find that course/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to courses/i })).toBeInTheDocument();
  });

  it("shows a loading spinner while the catalog loads", () => {
    vi.mocked(usePublicCourses).mockReturnValue(qres({ isLoading: true }));
    renderAt("agile-mindset");
    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
  });
});

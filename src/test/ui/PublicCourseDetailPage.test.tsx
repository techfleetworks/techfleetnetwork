// Module under test: src/pages/PublicCourseDetailPage.tsx
// B12: PublicCourseDetailPage — the public Core-course detail at /course/:courseKey.
// The catalog feed + duration hooks are mocked; the module/lesson content comes from
// the REAL course registry (src/data). Behavior: renders modules with Video/Reading
// + length, a Join CTA, and a not-found page for an unknown course.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import PublicCourseDetailPage from "@/pages/PublicCourseDetailPage";
import { usePublicCourses } from "@/hooks/use-public-catalog";
import { useYoutubeDurations } from "@/hooks/use-youtube-durations";

vi.mock("@/hooks/use-public-catalog", () => ({ usePublicCourses: vi.fn() }));
vi.mock("@/hooks/use-youtube-durations", async (importActual) => ({
  ...(await importActual<typeof import("@/hooks/use-youtube-durations")>()),
  useYoutubeDurations: vi.fn(),
}));

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
  // agile-mindset's first video lesson id is iOHQRwqSvyE (src/data/agile-course.ts).
  vi.mocked(useYoutubeDurations).mockReturnValue(qres({ data: { iOHQRwqSvyE: 510 } }));
});

describe("PublicCourseDetailPage (B12)", () => {
  it("renders the course title, module outline, and a Join Platform CTA", () => {
    renderAt("agile-mindset");
    expect(screen.getByRole("heading", { level: 1, name: "Agile Mindset" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you'll cover" })).toBeInTheDocument();
    const join = screen.getByRole("link", { name: /Join Platform/i });
    expect(join).toHaveAttribute("href", "/login?redirect=%2Fcourse%2Fagile-mindset");
  });

  it("shows a Video indicator and the formatted length for a video lesson", () => {
    renderAt("agile-mindset");
    // At least one lesson is a video...
    expect(screen.getAllByText("Video").length).toBeGreaterThan(0);
    // ...and the mocked duration for iOHQRwqSvyE renders as 8:30.
    expect(screen.getByText("8:30")).toBeInTheDocument();
  });

  it("omits the length when the duration map has no entry (graceful)", () => {
    vi.mocked(useYoutubeDurations).mockReturnValue(qres({ data: {} }));
    renderAt("agile-mindset");
    // Video indicator still shows; no "8:30" length.
    expect(screen.getAllByText("Video").length).toBeGreaterThan(0);
    expect(screen.queryByText("8:30")).not.toBeInTheDocument();
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

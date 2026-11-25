// Public (logged-out) courses + classes catalog — public-access B10.
//
// Rendered at /courses for anonymous visitors (a signed-in member gets the
// progress-rich TrainingPage at the same URL — the route branches on auth in
// App.tsx, per ADR 20261118-public-classes-pages). Shows three tabs:
//   - Onboarding Courses : the free Core-tier course outline (A8 projection)
//   - Basic Training     : published classes, track = basic_training
//   - Advanced Training  : published classes, track = advanced_training
//
// Every tile is a ContentCard (B9). Auth-aware CTAs live HERE (the caller), not
// in the card: "View details" is in-app SPA navigation (onClick), "Join Platform"
// carries an open-redirect-safe return path (B8 loginRedirectHref). Empty and
// error states (FR-8) each offer a join CTA so a visitor is never dead-ended.
import { useMemo, useState } from "react";
import { GraduationCap, Rocket, Lightbulb } from "lucide-react";
import { SEO } from "@/components/SEO";
import { coursesCatalogMeta } from "@/lib/seo/public-route-meta";
import {
  ResponsiveTabs,
  ResponsiveTabsList,
  ResponsiveTabsContent,
  type TabItem,
} from "@/components/ui/responsive-tabs";
import { ContentCard, type ContentCardImage } from "@/components/ContentCard";
import { CatalogState } from "@/components/CatalogState";
import { loginRedirectHref } from "@/lib/visibility/auth-gated-redirect";
import { stripHtml } from "@/lib/strip-html";
import {
  usePublicClasses,
  usePublicCourses,
  enrollmentStateOf,
  type PublicClassListItem,
  type PublicCourse,
} from "@/hooks/use-public-catalog";

const TRACK_LABEL: Record<string, string> = {
  basic_training: "Basic Training",
  advanced_training: "Advanced Training",
};

function formatStart(dateIso: string | undefined): string | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function blurbFromSummary(summary: string | null): string | undefined {
  const text = stripHtml(summary ?? "");
  return text ? text : undefined;
}

/** A class tile: View details (public class page) + Join Platform (sign-in redirect-back). */
function ClassCardTile({ cls }: { cls: PublicClassListItem }) {
  const detailPath = `/classes/${cls.slug}`;
  const firstCohort = cls.cohorts[0];
  const start = formatStart(firstCohort?.start_date);
  // The badge reflects the real enrollment phase (registration_status), not just
  // "has a cohort": `register_now`/`live` → open; a published upcoming cohort not
  // yet open → "Opening soon"; otherwise "Enrollment not open". A draft cohort is
  // never here (the gateway only returns published ones).
  const enrollment = enrollmentStateOf(cls.cohorts);
  const status =
    enrollment === "open"
      ? ({ label: "Registration open", tone: "success" } as const)
      : enrollment === "coming_soon"
        ? ({ label: "Opening soon", tone: "neutral" } as const)
        : ({ label: "Enrollment not open", tone: "neutral" } as const);
  // Typed as the discriminated union so an image forces its alt. An inline
  // `{...(cond ? {imageUrl,imageAlt} : {})}` spread widens imageUrl to an
  // optional string that matches NEITHER arm (TS2322) — bind it instead.
  const image: ContentCardImage = cls.hero_image_url
    ? { imageUrl: cls.hero_image_url, imageAlt: `${cls.title} cover` }
    : {};
  return (
    <ContentCard
      data-card="public-class"
      title={cls.title}
      titleHref={detailPath}
      {...image}
      status={status}
      meta={start ? `Starts ${start}` : undefined}
      chips={[TRACK_LABEL[cls.track] ?? cls.track]}
      blurb={blurbFromSummary(cls.summary)}
      secondaryAction={{
        label: "View details",
        // A real href (not SPA navigate) so the class page is a crawlable link
        // for SEO and is consistent with the title link (both <a>).
        href: detailPath,
        ariaLabel: `View details for ${cls.title}`,
      }}
      primaryAction={{
        label: "Join Platform",
        href: loginRedirectHref(detailPath),
        ariaLabel: `Join the platform to register for ${cls.title}`,
      }}
    />
  );
}

/** A free Core-course tile: View details (public course page, B12) + Join Platform. */
function CourseCardTile({ course }: { course: PublicCourse }) {
  const count = course.lessons.length;
  const detailPath = `/course/${course.course_key}`;
  return (
    <ContentCard
      data-card="public-course"
      title={course.display_label}
      titleHref={detailPath}
      status={{ label: "Free course", tone: "primary" }}
      meta={count > 0 ? `${count} ${count === 1 ? "lesson" : "lessons"}` : undefined}
      secondaryAction={{
        label: "View details",
        href: detailPath,
        ariaLabel: `View details for ${course.display_label}`,
      }}
      primaryAction={{
        label: "Join Platform",
        href: loginRedirectHref("/courses"),
        ariaLabel: `Join the platform to take ${course.display_label}`,
      }}
    />
  );
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";

/** The sign-in redirect-back target for this surface's FR-8 join CTAs. */
const COURSES_JOIN_HREF = loginRedirectHref("/courses");

export default function PublicCoursesPage() {
  const [tab, setTab] = useState("onboarding");

  const courses = usePublicCourses();
  const basic = usePublicClasses("basic_training");
  const advanced = usePublicClasses("advanced_training");

  const sortedCourses = useMemo(
    () => [...(courses.data ?? [])].sort((a, b) => a.display_order - b.display_order),
    [courses.data],
  );

  const tabs: TabItem[] = [
    { value: "onboarding", icon: <GraduationCap className="h-4 w-4" />, label: "Onboarding Courses" },
    { value: "basic", icon: <Lightbulb className="h-4 w-4" />, label: "Basic Training" },
    { value: "advanced", icon: <Rocket className="h-4 w-4" />, label: "Advanced Training" },
  ];

  return (
    <div className="container-app py-8 sm:py-12">
      <SEO {...coursesCatalogMeta()} />
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Courses</h1>
        <p className="text-muted-foreground mt-1">
          Free onboarding courses and cohort-based training. Join the platform to start.
        </p>
      </div>

      <ResponsiveTabs value={tab} onValueChange={setTab} className="w-full">
        <ResponsiveTabsList tabs={tabs} value={tab} onValueChange={setTab} className="mb-6" />

        <ResponsiveTabsContent value="onboarding">
          <CatalogState
            loading={courses.isLoading}
            error={courses.isError}
            empty={sortedCourses.length === 0}
            emptyText="There are no onboarding courses to show yet. Check back soon."
            joinHref={COURSES_JOIN_HREF}
          >
            <div className={GRID}>
              {sortedCourses.map((c) => (
                <CourseCardTile key={c.course_key} course={c} />
              ))}
            </div>
          </CatalogState>
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="basic">
          <CatalogState
            loading={basic.isLoading}
            error={basic.isError}
            empty={(basic.data ?? []).length === 0}
            emptyText="There are no basic training classes yet. Check back soon."
            joinHref={COURSES_JOIN_HREF}
          >
            <div className={GRID}>
              {(basic.data ?? []).map((c) => (
                <ClassCardTile key={c.id} cls={c} />
              ))}
            </div>
          </CatalogState>
        </ResponsiveTabsContent>

        <ResponsiveTabsContent value="advanced">
          <CatalogState
            loading={advanced.isLoading}
            error={advanced.isError}
            empty={(advanced.data ?? []).length === 0}
            emptyText="There are no advanced training classes yet. Check back soon."
            joinHref={COURSES_JOIN_HREF}
          >
            <div className={GRID}>
              {(advanced.data ?? []).map((c) => (
                <ClassCardTile key={c.id} cls={c} />
              ))}
            </div>
          </CatalogState>
        </ResponsiveTabsContent>
      </ResponsiveTabs>
    </div>
  );
}

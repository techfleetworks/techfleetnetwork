// Public (logged-out) Core-course detail — public-access B12. Rendered at
// /course/:courseKey for anonymous visitors (a signed-in member is redirected to
// their in-platform course page by CourseDetailRoute). Shows the course's modules
// and, per lesson, the title, whether it's a video or a reading, and a one-sentence
// plain-English takeaway — so a visitor can see exactly what the free course covers
// before joining.
//
// Content (module/lesson titles, youtubeId, takeaway) is read client-side from the
// course registry (the §6 gateway carries the outline only; lesson copy is bundled
// and already public). The takeaways are authored sentences (public-course-takeaways)
// — the earlier live-YouTube-length route was dropped. WHICH courses are public +
// their label stay owned by the public-courses gateway (usePublicCourses) — a key
// not in that feed is not found. See ADR 20261124-public-course-takeaways.
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, BookOpen, GraduationCap, Loader2, Play } from "lucide-react";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loginRedirectHref } from "@/lib/visibility/auth-gated-redirect";
import { usePublicCourses } from "@/hooks/use-public-catalog";
import { publicCourseModules } from "@/data/public-course-registry";

export default function PublicCourseDetailPage() {
  const { courseKey } = useParams<{ courseKey: string }>();
  const courses = usePublicCourses();
  const modules = publicCourseModules(courseKey);

  const course = (courses.data ?? []).find((c) => c.course_key === courseKey);

  if (courses.isLoading) {
    return (
      <div className="container-app flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  // Not found = the key is not a public Core course (gateway) or has no content
  // (registry). isError = the catalog feed failed.
  if (courses.isError || !course || !modules) {
    const failed = courses.isError;
    return (
      <div className="container-app py-16">
        <SEO
          title={failed ? "Course unavailable" : "Course not found"}
          description="This course could not be loaded."
          canonicalPath={`/course/${courseKey ?? ""}`}
        />
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {failed ? "We couldn't load that course" : "We couldn't find that course"}
        </h1>
        <p className="text-base text-muted-foreground max-w-md mb-6">
          {failed
            ? "Something went wrong. Please try again in a moment."
            : "The link may be out of date, or the course is not public."}
        </p>
        <Button asChild variant="outline">
          <Link to="/courses">
            <ArrowLeft className="h-4 w-4" /> Back to courses
          </Link>
        </Button>
      </div>
    );
  }

  const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0);

  return (
    <div className="container-app py-8 sm:py-12">
      <SEO
        title={course.display_label}
        description={`A free Tech Fleet course: ${lessonCount} lessons across ${modules.length} modules. Join the platform to start.`}
        canonicalPath={`/course/${course.course_key}`}
        ogType="article"
      />

      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/courses">
          <ArrowLeft className="h-4 w-4" /> Courses
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
        {/* Main column: the module + lesson outline */}
        <div className="space-y-8 lg:col-span-2">
          <header className="space-y-3">
            <Badge className="bg-primary text-primary-foreground border-transparent px-3 py-1 text-sm font-semibold uppercase tracking-wide">
              Free course
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{course.display_label}</h1>
            <p className="text-base text-muted-foreground">
              {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"} across {modules.length}{" "}
              {modules.length === 1 ? "module" : "modules"}
            </p>
          </header>

          <section className="space-y-6">
            <h2 className="text-2xl font-bold text-foreground">What you'll cover</h2>
            {modules.map((mod, mi) => (
              <div key={`${mod.title}-${mi}`} className="space-y-3">
                <h3 className="text-xl font-bold text-foreground">
                  <span className="text-muted-foreground">Module {mi + 1}:</span> {mod.title}
                </h3>
                <ul className="space-y-2">
                  {mod.lessons.map((lesson) => {
                    const isVideo = !!lesson.youtubeId;
                    return (
                      <li
                        key={lesson.id}
                        className="flex items-start gap-3 rounded-md border bg-card px-3 py-2"
                      >
                        <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
                          {isVideo ? <Play className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                        </span>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-3">
                            <span className="text-base font-medium text-foreground">{lesson.title}</span>
                            <span className="shrink-0 text-sm text-muted-foreground">
                              {isVideo ? "Video" : "Reading"}
                            </span>
                          </div>
                          {lesson.takeaway && (
                            <p className="text-sm text-muted-foreground">{lesson.takeaway}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        </div>

        {/* Aside: join CTA */}
        <aside className="space-y-4">
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="text-lg font-bold text-foreground">Free to take</p>
            </div>
            <p className="text-base text-muted-foreground">
              Join the platform to watch the videos, read the lessons, and track your progress.
            </p>
            <Button asChild className="w-full">
              <a href={loginRedirectHref(`/course/${course.course_key}`)}>Join Platform</a>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

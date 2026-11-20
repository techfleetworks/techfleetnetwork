// Public (logged-out AND logged-in) class detail — public-access B10.
//
// Rendered at /classes/:slug for everyone (the edge function public-class-detail
// is the §6 gateway; anon and members both read it, members additionally get
// cohort status/capacity/timezone). The "schedule" is the cohort itself (dates,
// and timezone for members) — there is no separate schedule field (owner, 2026-11-18).
//
// The ONE auth-aware decision on this page is the cohort CTA: an anonymous visitor
// is sent to Join Platform (open-redirect-safe return path, B8) because the class
// readiness path is "join, then register"; a signed-in member gets the external
// Register-on-Gumroad link. Free-text is rendered as plain text (never raw HTML)
// to avoid injecting teacher-authored markup.
import { useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loginRedirectHref } from "@/lib/visibility/auth-gated-redirect";
import { safeHref } from "@/lib/security";
import { stripHtml } from "@/lib/strip-html";
import { usePublicClassDetail, type PublicCohort } from "@/hooks/use-public-catalog";

const TRACK_LABEL: Record<string, string> = {
  basic_training: "Basic Training",
  advanced_training: "Advanced Training",
};

function formatDate(dateIso: string | undefined): string | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function ListSection({ title, items }: { title: string; items: string[] | null | undefined }) {
  // Defense in depth: coerce to an array before iterating. A public field whose
  // hand-written type disagrees with the real DB column (e.g. a text column typed
  // as string[]) would otherwise reach `.map` on a non-array and crash the whole
  // page via the error boundary. A render helper must never be the thing that
  // white-screens the page on a shape surprise.
  const list = Array.isArray(items) ? items.filter((i) => typeof i === "string") : [];
  if (list.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <ul className="list-disc space-y-1 pl-5">
        {list.map((item) => (
          <li key={item} className="text-base text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A cohort card = the class schedule (dates; timezone for signed-in members) + CTA. */
function CohortCard({
  cohort,
  slug,
  isAuthed,
}: {
  cohort: PublicCohort;
  slug: string;
  isAuthed: boolean;
}) {
  const start = formatDate(cohort.start_date);
  const end = formatDate(cohort.end_date);
  // Scheme-guard the teacher/admin-authored registration URL before it becomes an
  // href on this public page: safeHref rejects javascript:/data:/SSRF and returns
  // undefined, so a malicious URL can never execute (defense in depth — the client
  // zod requires https:// on write, but there is no DB CHECK on the column).
  const safeRegistration = safeHref(cohort.registration_url);
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <Badge className="bg-success text-primary-foreground border-transparent px-3 py-1 text-sm font-semibold uppercase tracking-wide">
        Registration open
      </Badge>
      <div>
        <p className="text-lg font-bold text-foreground">{cohort.label}</p>
        {(start || end) && (
          <p className="text-base text-muted-foreground mt-1">
            {start}
            {start && end ? " to " : ""}
            {end}
          </p>
        )}
        {isAuthed && cohort.timezone && (
          <p className="text-base text-muted-foreground mt-1">Time zone: {cohort.timezone}</p>
        )}
      </div>
      {isAuthed ? (
        safeRegistration ? (
          <Button asChild className="w-full">
            <a href={safeRegistration} target="_blank" rel="noopener noreferrer nofollow">
              Register on Gumroad
            </a>
          </Button>
        ) : (
          <Button className="w-full" disabled>
            Registration link unavailable
          </Button>
        )
      ) : (
        <Button asChild className="w-full">
          <a href={loginRedirectHref(`/classes/${slug}`)}>Join Platform to register</a>
        </Button>
      )}
    </div>
  );
}

export default function PublicClassDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const { data, isLoading, isError } = usePublicClassDetail(slug);

  if (isLoading) {
    return (
      <div className="container-app flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  // null = 404 (not found / not published); isError = network/5xx.
  if (isError || !data) {
    const notFound = !isError;
    return (
      <div className="container-app py-16">
        <SEO
          title={notFound ? "Class not found" : "Class unavailable"}
          description="This class could not be loaded."
          canonicalPath={`/classes/${slug ?? ""}`}
        />
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {notFound ? "We couldn't find that class" : "We couldn't load that class"}
        </h1>
        <p className="text-base text-muted-foreground max-w-md mb-6">
          {notFound
            ? "It may have been unpublished or the link is out of date."
            : "Something went wrong. Please try again in a moment."}
        </p>
        <Button asChild variant="outline">
          <Link to="/courses">
            <ArrowLeft className="h-4 w-4" /> Back to courses &amp; classes
          </Link>
        </Button>
      </div>
    );
  }

  const cls = data.class;
  const cohorts = data.cohorts ?? [];
  const summaryText = stripHtml(cls.summary ?? "");
  const descriptionText = stripHtml(cls.description ?? "");
  // `outcomes` is a single rich-text string (not a list) — render it as prose via
  // stripHtml, the same way description/curriculum are (teacher free-text is shown
  // as plain text on this public page, never injected as raw HTML).
  const outcomesText = stripHtml(cls.outcomes ?? "");
  const curriculumText = stripHtml(cls.curriculum ?? "");

  return (
    <div className="container-app py-8 sm:py-12">
      <SEO
        title={cls.title}
        description={summaryText || `A Tech Fleet ${TRACK_LABEL[cls.track] ?? "training"} class.`}
        canonicalPath={`/classes/${cls.slug}`}
        ogType="article"
      />

      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/courses">
          <ArrowLeft className="h-4 w-4" /> Courses &amp; classes
        </Link>
      </Button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-8 lg:col-span-2">
          <header className="space-y-3">
            {cls.hero_image_url && (
              // onError is a media-load event (fallback to no image), not an
              // interaction — the a11y rule's false positive here.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
              <img
                src={cls.hero_image_url}
                alt={`${cls.title} cover`}
                className="h-48 w-full rounded-lg object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-sm">
                {TRACK_LABEL[cls.track] ?? cls.track}
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{cls.title}</h1>
            {cls.instructor_name && (
              <p className="text-base text-muted-foreground">Taught by {cls.instructor_name}</p>
            )}
            {summaryText && <p className="text-base text-foreground">{summaryText}</p>}
          </header>

          {descriptionText && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">About this class</h2>
              <p className="whitespace-pre-line text-base text-foreground">{descriptionText}</p>
            </section>
          )}

          {outcomesText && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">What you'll learn</h2>
              <p className="whitespace-pre-line text-base text-foreground">{outcomesText}</p>
            </section>
          )}

          <ListSection title="Skills" items={cls.skills} />
          <ListSection title="Prerequisites" items={cls.prerequisites} />
          <ListSection title="Deliverables" items={cls.deliverables} />

          {curriculumText && (
            <section className="space-y-2">
              <h2 className="text-xl font-bold text-foreground">Curriculum</h2>
              <p className="whitespace-pre-line text-base text-foreground">{curriculumText}</p>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xl font-bold text-foreground">How to join</h2>
            <ol className="list-decimal space-y-1 pl-5 text-base text-foreground">
              <li>Join the platform</li>
              <li>Register for the class</li>
              <li>Onboard to the community</li>
              <li>Finish the free agile courses</li>
              <li>Start your class modules</li>
            </ol>
          </section>
        </div>

        {/* Schedule / cohort column */}
        <aside className="space-y-4">
          <h2 className="text-xl font-bold text-foreground">Schedule</h2>
          {cohorts.length > 0 ? (
            cohorts.map((c) => (
              <CohortCard key={c.id} cohort={c} slug={cls.slug} isAuthed={!!user} />
            ))
          ) : (
            <div className="rounded-lg border bg-card p-6">
              <p className="text-base text-muted-foreground">
                No cohort is open for registration right now. Check back soon.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

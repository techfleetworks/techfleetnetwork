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
// Register-on-Gumroad link.
//
// Teacher-authored rich text (summary/description/outcomes/curriculum) is rendered
// as SANITIZED HTML via `sanitizeHtml` (DOMPurify allowlist — the same control the
// authenticated ClassDetailPage uses), NOT stripped to plain text. Stripping
// flattened the authored headings/paragraphs/lists into one run-on blob (the
// "Overview…Project" jam, the curriculum wall-of-text); sanitized HTML preserves
// that structure, which is also far more scannable by crawlers. This reverses the
// original "plain text only" stance — see ADR 20261120-public-rich-text.
import { useParams, Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loginRedirectHref } from "@/lib/visibility/auth-gated-redirect";
import { safeHref, sanitizeHtml } from "@/lib/security";
import { stripHtml } from "@/lib/strip-html";
import { usePublicClassDetail, type PublicCohort } from "@/hooks/use-public-catalog";

const TRACK_LABEL: Record<string, string> = {
  basic_training: "Basic Training",
  advanced_training: "Advanced Training",
};

// Section headings are H1-scale (prominent + consistent, per owner). They stay
// <h2> for a correct document outline — one semantic <h1> (the class title) is
// what crawlers reward; eight real <h1>s would hurt the very scannability we want.
const SECTION_HEADING = "text-2xl font-bold text-foreground";

const JOIN_STEPS = [
  "Join the platform",
  "Register for the class",
  "Onboard to the community",
  "Finish the free agile courses",
  "Start your class modules",
];

function formatDate(dateIso: string | undefined): string | null {
  if (!dateIso) return null;
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

/** Coerce a public list field to a clean string[] (never crashes on a shape surprise). */
function toStringList(items: string[] | null | undefined): string[] {
  if (items != null && !Array.isArray(items)) {
    // Compile-time lock (public-catalog-db-contract) catches type drift; this
    // surfaces a runtime wire-shape surprise instead of failing silently.
    console.warn(`toStringList: expected string[] but got ${typeof items} — coercing to empty.`);
  }
  return Array.isArray(items) ? items.filter((i): i is string => typeof i === "string") : [];
}

/**
 * A section that renders teacher-authored rich text as sanitized HTML (with an
 * optional heading), or nothing when the field is empty. Sanitization happens here,
 * once, at the single `dangerouslySetInnerHTML` sink: `sanitizeHtml` is a DOMPurify
 * allowlist (p/h2/h3/ul/ol/li/strong/em/a only; scripts, event handlers, iframes and
 * non-http(s) URLs stripped, rel=noopener forced on links) — the same control the
 * authenticated class page uses, so active markup cannot be injected.
 */
function RichSection({ title, html }: { title?: string; html: string | null | undefined }) {
  const clean = sanitizeHtml(html ?? "");
  if (!clean) return null;
  return (
    <section className="space-y-3">
      {title && <h2 className={SECTION_HEADING}>{title}</h2>}
      <div
        className="prose prose-invert max-w-none text-base text-foreground prose-headings:text-foreground prose-h2:text-2xl prose-h2:font-bold prose-h3:text-xl prose-h3:font-bold prose-p:text-foreground prose-li:text-foreground prose-a:text-primary prose-strong:text-foreground"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </section>
  );
}

function ListSection({ title, items }: { title: string; items: string[] | null | undefined }) {
  const list = toStringList(items);
  if (list.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className={SECTION_HEADING}>{title}</h2>
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
  // Plain-text summary is for the SEO <meta> description only (never for display).
  const summaryMeta = stripHtml(cls.summary ?? "");
  const skills = toStringList(cls.skills);
  // Prerequisites are stored as a string[] of sentence fragments, but read as one
  // paragraph — join them rather than bulleting the fragments.
  const prerequisitesText = toStringList(cls.prerequisites).join(" ").trim();

  return (
    <div className="container-app py-8 sm:py-12">
      <SEO
        title={cls.title}
        description={summaryMeta || `A Tech Fleet ${TRACK_LABEL[cls.track] ?? "training"} class.`}
        canonicalPath={`/classes/${cls.slug}`}
        ogType="article"
      />

      <Button asChild variant="link" className="mb-4 px-0">
        <Link to="/courses">
          <ArrowLeft className="h-4 w-4" /> Courses &amp; classes
        </Link>
      </Button>

      {/* More column gap on lg so the main text doesn't crowd the schedule card. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-12">
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
              // Byline, not a section heading — a styled <p>, so it stays larger
              // than body text without inserting an h4 between the h1 and the
              // authored h2s (which would skip a heading level / fail a11y).
              <p className="text-lg font-semibold text-foreground">Taught by {cls.instructor_name}</p>
            )}
          </header>

          {/* Summary carries its own authored "Overview"/"Project" headings. */}
          <RichSection html={cls.summary} />
          <RichSection title="About this class" html={cls.description} />
          <RichSection title="What you'll learn" html={cls.outcomes} />

          {skills.length > 0 && (
            <section className="space-y-3">
              <h2 className={SECTION_HEADING}>Skills</h2>
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <Badge key={skill} variant="secondary" className="rounded-full px-3 py-1 text-sm font-medium">
                    {skill}
                  </Badge>
                ))}
              </div>
            </section>
          )}

          {prerequisitesText && (
            <section className="space-y-3">
              <h2 className={SECTION_HEADING}>Prerequisites</h2>
              <p className="text-base text-foreground">{prerequisitesText}</p>
            </section>
          )}

          <ListSection title="Deliverables" items={cls.deliverables} />

          <RichSection title="Curriculum" html={cls.curriculum} />

          <section className="space-y-4">
            <h2 className={SECTION_HEADING}>How to join</h2>
            <ol className="space-y-4">
              {JOIN_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                  <p className="pt-1 text-base text-foreground">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Schedule / cohort column — the card is self-describing, no header needed. */}
        <aside className="space-y-4">
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

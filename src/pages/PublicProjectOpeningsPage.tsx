// Public (logged-out) project openings catalog — public-access B11.
//
// Rendered at /project-openings for anonymous visitors (a signed-in member gets
// the progress-rich ProjectOpeningsPage at the same URL — the route branches on
// auth in ProjectOpeningsRoute, mirroring B10's CoursesRoute). Shows the visible
// project openings with team-hat chips. The public project DETAIL page already
// serves anon (ProjectOpeningDetailPage via the public-project-detail gateway),
// so B11 is the listing that was still member-only + its nav surfacing.
//
// Every tile is a ContentCard (B9). Auth-aware CTAs live HERE (the caller), not in
// the card: "View opening" is a crawlable link to the public detail page; "Join
// Platform" carries an open-redirect-safe return path (B8 loginRedirectHref) —
// "apply" is an auth-gated action (public-nav-policy), so anon joins first, then
// applies. Loading / error / empty states (FR-8) share CatalogState with B10.
import { useMemo } from "react";
import { SEO } from "@/components/SEO";
import { ContentCard, type ContentCardImage, type ContentCardTone } from "@/components/ContentCard";
import { CatalogState } from "@/components/CatalogState";
import { loginRedirectHref } from "@/lib/visibility/auth-gated-redirect";
import { stripHtml } from "@/lib/strip-html";
import { PROJECT_TYPES, PROJECT_STATUSES } from "@/data/project-constants";
import { usePublicProjectOpenings, type PublicProjectOpening } from "@/hooks/use-public-catalog";

const typeLabel = (v: string) => PROJECT_TYPES.find((t) => t.value === v)?.label ?? v;
const statusLabel = (v: string) => PROJECT_STATUSES.find((s) => s.value === v)?.label ?? v;

// Status → card tone. ContentCard has no amber/`warning` tone (fails AA), so
// "opening soon"/"forming" map to neutral (B9 decision). Accepting-applications
// states read as success; an in-progress project as primary.
const STATUS_TONE: Record<string, ContentCardTone> = {
  apply_now: "success",
  recruiting: "success",
  coming_soon: "neutral",
  team_onboarding: "neutral",
  project_in_progress: "primary",
};

// Open-for-applications first, then opening soon, then the rest — so a visitor
// sees what they can act on now at the top. (The gateway already excludes
// completed/invisible projects; this only orders the visible set.)
const STATUS_ORDER: Record<string, number> = {
  apply_now: 0,
  recruiting: 1,
  coming_soon: 2,
  team_onboarding: 3,
  project_in_progress: 4,
};

function blurbFrom(description: string | null): string | undefined {
  const text = stripHtml(description ?? "");
  return text ? text : undefined;
}

/** A project-opening tile: View opening (public detail page) + Join Platform. */
function OpeningCardTile({ opening }: { opening: PublicProjectOpening }) {
  const detailPath = `/project-openings/${opening.id}`;
  const title = opening.friendly_name?.trim() || opening.client?.name || "Project Opening";
  const status = {
    label: statusLabel(opening.project_status),
    tone: STATUS_TONE[opening.project_status] ?? "neutral",
  } as const;
  const hats = (opening.team_hats ?? []).filter(Boolean);
  // No hero image for a project (the anon field set has none, and a client logo is
  // not hero-shaped) — ContentCard renders its muted placeholder. The empty union
  // arm keeps imageAlt from being required.
  const image: ContentCardImage = {};
  return (
    <ContentCard
      data-card="public-project"
      title={title}
      titleHref={detailPath}
      {...image}
      status={status}
      meta={typeLabel(opening.project_type)}
      chips={hats.length ? hats : undefined}
      blurb={blurbFrom(opening.description)}
      secondaryAction={{
        label: "View opening",
        // A real href (not SPA navigate) so the detail page is a crawlable link
        // for SEO, consistent with the title link.
        href: detailPath,
        ariaLabel: `View the ${title} opening`,
      }}
      primaryAction={{
        label: "Join Platform",
        href: loginRedirectHref(detailPath),
        ariaLabel: `Join the platform to apply to ${title}`,
      }}
    />
  );
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4";

export default function PublicProjectOpeningsPage() {
  const openings = usePublicProjectOpenings();

  const sorted = useMemo(
    () =>
      [...(openings.data ?? [])].sort((a, b) => {
        const byStatus =
          (STATUS_ORDER[a.project_status] ?? 99) - (STATUS_ORDER[b.project_status] ?? 99);
        if (byStatus !== 0) return byStatus;
        // Newest first within a status band.
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      }),
    [openings.data],
  );

  return (
    <div className="container-app py-8 sm:py-12">
      <SEO
        title="Project Openings"
        description="Browse Tech Fleet's open projects and the roles each team is looking for. Join the platform to apply and get real product experience."
        canonicalPath="/project-openings"
      />
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Project Openings</h1>
        <p className="text-muted-foreground mt-1">
          Real projects looking for volunteers. Join the platform to apply for a role.
        </p>
      </div>

      <CatalogState
        loading={openings.isLoading}
        error={openings.isError}
        empty={sorted.length === 0}
        emptyText="There are no open projects right now. Check back soon — new openings post regularly."
        joinHref={loginRedirectHref("/project-openings")}
      >
        <div className={GRID}>
          {sorted.map((o) => (
            <OpeningCardTile key={o.id} opening={o} />
          ))}
        </div>
      </CatalogState>
    </div>
  );
}

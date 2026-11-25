// Single owner of each public route's SEO metadata — title, description, canonical
// path, Open Graph, and schema.org JSON-LD (public-access C14a).
//
// Pure data in -> PageMeta out. No react, no DOM, no fetch here, so BOTH consumers
// build identical head tags from ONE source and cannot drift:
//   - runtime: the <SEO> component (react-helmet) on each public page;
//   - build time: the C14b prerender script (Node, no browser) that writes the
//     real <head> into dist/<route>/index.html for non-JS crawlers.
//
// This module decides a page's meta; the component and the prerender script only
// FORMAT it (ADR-20261116: presentation reflects, it does not decide). Keep it
// framework-free so the Node prerender can import it unchanged. The one import
// (canonical-origin) is window-free at load, so it stays prerender-safe.
import { PRIMARY_PRODUCTION_ORIGIN } from "@/lib/canonical-origin";

export const SITE_NAME = "Tech Fleet Network";
// Single-sourced from canonical-origin (the one owner of the production origin),
// not a second literal — the SEO canonical IS that canonical origin.
export const BASE_URL = PRIMARY_PRODUCTION_ORIGIN;
const TITLE_SUFFIX =
  " | Tech Fleet Network Platform | Agile Practice and Teamwork For All";

/** schema.org node or a list of them (serialized into one <script> as an array). */
export type JsonLd = Record<string, unknown> | Record<string, unknown>[];

export interface PageMeta {
  /** Raw page title; the shared suffix is applied by formatTitle, not stored here. */
  title: string;
  description: string;
  /** Site-root-relative path, e.g. "/courses"; absoluteUrl() makes it canonical. */
  canonicalPath: string;
  ogType: "website" | "article";
  /** Absolute image URL for OG/Twitter cards; omitted -> no image tags emitted. */
  ogImage?: string;
  jsonLd?: JsonLd;
}

/** Apply the shared title suffix once (idempotent if the brand is already present). */
export function formatTitle(title: string): string {
  return title.includes("Tech Fleet Network Platform")
    ? title
    : `${title}${TITLE_SUFFIX}`;
}

/** A root-relative path -> the canonical absolute URL (empty path -> site root). */
export function absoluteUrl(path: string): string {
  return path ? `${BASE_URL}${path}` : BASE_URL;
}

/**
 * Serialize JSON-LD for a <script type="application/ld+json"> body. `<` is escaped
 * to its unicode form so a value containing "</script>" cannot break out of the
 * tag (the one injection vector for inline JSON-LD). Both the runtime component and
 * the prerender script use this, so the escaping is applied exactly once, in one
 * place.
 */
export function jsonLdToString(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The Organization node, reused by the landing page and as a publisher reference. */
function organizationNode(): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    name: SITE_NAME,
    url: BASE_URL,
    description:
      "A nonprofit building empowered team spaces — practice agile teamwork with real nonprofit clients.",
  };
}

// ---------------------------------------------------------------------------
// Static public routes. The copy here is the authored source for each route's
// meta; a page passes the whole PageMeta to <SEO> rather than inline strings.
// ---------------------------------------------------------------------------

export function landingMeta(): PageMeta {
  return {
    title: "Tech Fleet — Professional Training Platform",
    description:
      "Develop the skills and mindset for success. Practice with real teams and grow as a leader at Tech Fleet.",
    canonicalPath: "/",
    ogType: "website",
    jsonLd: [
      organizationNode(),
      {
        "@type": "WebSite",
        "@id": `${BASE_URL}/#website`,
        name: SITE_NAME,
        url: BASE_URL,
        publisher: { "@id": `${BASE_URL}/#organization` },
      },
    ],
  };
}

export function coursesCatalogMeta(): PageMeta {
  return {
    title: "Courses",
    description:
      "Browse Tech Fleet's free courses and training classes. Open any course and read what it covers — no account needed.",
    canonicalPath: "/courses",
    ogType: "website",
    jsonLd: {
      "@type": "CollectionPage",
      name: "Courses | Tech Fleet",
      url: absoluteUrl("/courses"),
      isPartOf: { "@id": `${BASE_URL}/#website` },
      about: "Free courses and training classes at Tech Fleet.",
    },
  };
}

export function projectOpeningsListMeta(): PageMeta {
  return {
    title: "Project Openings",
    description:
      "Find a real cross-functional team working with a nonprofit client, and see which roles are open to join at Tech Fleet.",
    canonicalPath: "/project-openings",
    ogType: "website",
    jsonLd: {
      "@type": "CollectionPage",
      name: "Project Openings | Tech Fleet",
      url: absoluteUrl("/project-openings"),
      isPartOf: { "@id": `${BASE_URL}/#website` },
      about: "Open project teams looking for members at Tech Fleet.",
    },
  };
}

/**
 * Wrap a schema.org node list under the standard @context, the shape the prerender
 * script writes and the <SEO> component renders. Callers hand this to jsonLdToString.
 */
export function withContext(data: JsonLd): Record<string, unknown> {
  const nodes = Array.isArray(data) ? data : [data];
  return { "@context": "https://schema.org", "@graph": nodes };
}

// ---------------------------------------------------------------------------
// Dynamic (entity-driven) routes — the detail pages (C14b). Each takes the
// minimal fields the public gateways already expose, as PLAIN TEXT (the caller
// strips any HTML), so the runtime detail page AND the build-time prerender
// build identical meta from this one owner. These builders own the description
// template + JSON-LD shape; the caller owns only the HTML-stripping of source
// prose. Course JSON-LD is schema.org Course (free); a project is a CreativeWork.
// ---------------------------------------------------------------------------

export function classDetailMeta(input: {
  slug: string;
  title: string;
  /** Pre-stripped plain-text summary; empty falls back to a track-aware line. */
  summaryText: string;
  trackLabel?: string;
}): PageMeta {
  const description =
    input.summaryText.trim() ||
    `A Tech Fleet ${input.trackLabel ?? "training"} class. Join the platform to register.`;
  return {
    title: input.title,
    description,
    canonicalPath: `/classes/${input.slug}`,
    ogType: "article",
    jsonLd: {
      "@type": "Course",
      name: input.title,
      description,
      url: absoluteUrl(`/classes/${input.slug}`),
      provider: { "@id": `${BASE_URL}/#organization` },
    },
  };
}

export function courseDetailMeta(input: {
  courseKey: string;
  displayLabel: string;
  /** The "This course teaches you ___" completion (plain text), or null. */
  summary: string | null;
  lessonCount: number;
  moduleCount: number;
}): PageMeta {
  const description = input.summary
    ? `This free Tech Fleet course teaches you ${input.summary} ${input.lessonCount} lessons across ${input.moduleCount} modules. Join the platform to start.`
    : `A free Tech Fleet course: ${input.lessonCount} lessons across ${input.moduleCount} modules. Join the platform to start.`;
  return {
    title: input.displayLabel,
    description,
    canonicalPath: `/course/${input.courseKey}`,
    ogType: "article",
    jsonLd: {
      "@type": "Course",
      name: input.displayLabel,
      description,
      url: absoluteUrl(`/course/${input.courseKey}`),
      provider: { "@id": `${BASE_URL}/#organization` },
      isAccessibleForFree: true,
    },
  };
}

export function projectOpeningMeta(input: {
  id: string;
  title: string;
  /** Pre-stripped plain-text description; empty falls back to a roles line. */
  descriptionText: string;
  teamHats?: string[] | null;
}): PageMeta {
  const roles = (input.teamHats ?? []).filter((h): h is string => !!h && h.trim().length > 0);
  const description =
    input.descriptionText.trim() ||
    (roles.length > 0
      ? `An open Tech Fleet project team looking for ${roles.slice(0, 3).join(", ")}. Join the platform to apply.`
      : "An open Tech Fleet project team. Join the platform to apply.");
  return {
    title: input.title,
    description,
    canonicalPath: `/project-openings/${input.id}`,
    ogType: "article",
    jsonLd: {
      "@type": "CreativeWork",
      name: input.title,
      description,
      url: absoluteUrl(`/project-openings/${input.id}`),
      publisher: { "@id": `${BASE_URL}/#organization` },
    },
  };
}

// Public (logged-out) catalog data — public-access B10.
//
// Anon has NO direct table grants after the A6 REVOKE, so these hooks read
// through the server-side gateways (the edge functions that own the §6 field
// allowlist), NOT the Supabase client used by the authed `use-classes` hooks.
// That is the whole point of the public-access architecture: the gateway is the
// one place the public field set is enforced. These are the client adapters for
// that contract (classes listing + class detail + the free Core-course outline).
//
// See docs/adr/20261118-public-classes-pages.md and the edge functions
// supabase/functions/{public-classes,public-class-detail,public-courses}.
import { useQuery } from "@/lib/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export type ClassTrack = "basic_training" | "advanced_training";

/** The cohort's public enrollment phase (DB enum cohort_registration_status). */
export type CohortRegistrationStatus = "coming_soon" | "register_now" | "live" | "finished";

export interface PublicCohort {
  id: string;
  label: string;
  start_date: string;
  end_date: string;
  registration_url: string;
  // Public enrollment phase — drives the "open to register" vs "opening soon" UI.
  registration_status: CohortRegistrationStatus;
  // Authed-only extras (present only for a signed-in member).
  status?: string;
  capacity?: number | null;
  timezone?: string;
}

/** A single cohort's public enrollment state. */
export type CohortPublicState = "open" | "coming_soon" | "closed";

/** A class's enrollment state, derived from its (already published, future) cohorts. */
export type EnrollmentState = "open" | "coming_soon" | "none";

/**
 * The `switch` default. COMPILE time: `x` is `never` while the switch is exhaustive,
 * so a new enum value that lacks a case is a type error here — a status can never be
 * silently unmapped. RUNTIME: this is reached only by deploy skew (a DB enum value
 * newer than this deployed bundle). It fails SAFE — "closed" (i.e. "not open", never a
 * false "open") — and reports, rather than throwing in the public render path and
 * crashing the catalog/detail for every anon visitor.
 */
function exhaustiveFallback(x: never, fallback: CohortPublicState): CohortPublicState {
  console.warn(`Unhandled cohort registration_status: ${String(x)} — treating as "${fallback}".`);
  return fallback;
}

/**
 * THE single mapping from a cohort's `registration_status` to what the public sees.
 * Every public surface (the catalog listing AND the class-detail badge/CTA) derives
 * its "open / opening soon / closed" from HERE — they cannot diverge, so a false
 * "open" or false "closed" cannot arise from two copies drifting apart.
 *
 * The `switch` is EXHAUSTIVE over `CohortRegistrationStatus`: add a fifth status and
 * this stops compiling (`assertNever`), forcing a deliberate decision rather than a
 * silent default. Register-open (`register_now`/`live`) is reachable ONLY on a cohort
 * that is published + not-ended — enforced at the write boundary by
 * `set_cohort_registration_status` (ADR 20261125-cohort-registration-open-invariant),
 * and the gateways only ever return published, not-ended cohorts — so "open" here
 * always means "publicly open to register", with no third gate to get wrong.
 */
export function cohortPublicEnrollment(
  c: Pick<PublicCohort, "registration_status">,
): CohortPublicState {
  switch (c.registration_status) {
    case "register_now":
    case "live":
      return "open";
    case "coming_soon":
      return "coming_soon";
    case "finished":
      return "closed";
    default:
      return exhaustiveFallback(c.registration_status, "closed");
  }
}

/** True when a cohort can be registered for right now. Derived from the one mapping. */
export function isRegisterable(c: Pick<PublicCohort, "registration_status">): boolean {
  return cohortPublicEnrollment(c) === "open";
}

/**
 * Classify a class by its cohorts: `open` (at least one open cohort), else
 * `coming_soon` (a published upcoming cohort not yet open), else `none`. Reduces the
 * per-cohort `cohortPublicEnrollment` over the class's cohorts — the SAME source the
 * detail page uses, so listing and detail can never disagree. The gateway has already
 * filtered to published, not-yet-ended cohorts.
 */
export function enrollmentStateOf(cohorts: readonly PublicCohort[] | null | undefined): EnrollmentState {
  const list = cohorts ?? [];
  if (list.some((c) => cohortPublicEnrollment(c) === "open")) return "open";
  if (list.some((c) => cohortPublicEnrollment(c) === "coming_soon")) return "coming_soon";
  return "none";
}

export interface PublicClassListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  track: ClassTrack;
  hero_image_url: string | null;
  // `outcomes` is a single rich-text/HTML string in the DB (classes.outcomes is a
  // text column, edited via the rich-text field in ClassFormPage), NOT an array —
  // unlike skills/prerequisites/deliverables which are text[]. Typing it as an
  // array and rendering it through a list caller crashed the detail page
  // (string.map is not a function). Locked by src/test/types/public-catalog-db-contract.test.ts.
  outcomes: string | null;
  skills: string[] | null;
  prerequisites: string[] | null;
  published_at: string | null;
  cohorts: PublicCohort[];
}

export interface PublicClassDetail {
  id: string;
  slug: string;
  track: ClassTrack;
  status: string;
  title: string;
  summary: string | null;
  description: string | null;
  // `outcomes` is a single rich-text/HTML string (text column), NOT an array —
  // see the note on PublicClassListItem. Rendered as prose, like description.
  outcomes: string | null;
  skills: string[] | null;
  prerequisites: string[] | null;
  hero_image_url: string | null;
  short_description: string | null;
  deliverables: string[] | null;
  curriculum: string | null;
  published_at: string | null;
  instructor_name: string | null;
}

export interface PublicCourseLesson {
  lesson_id: string;
  course_key: string;
  display_order: number;
  required: boolean;
}

export interface PublicCourse {
  course_key: string;
  display_label: string;
  display_order: number;
  phase: string | null;
  tier: string;
  lessons: PublicCourseLesson[];
}

// 8s request timeout (repo convention): react-query imposes none, so a hung
// gateway would otherwise leave the page in a perpetual loading state and the
// error UI would never fire. AbortError is rethrown and surfaces as isError.
const REQUEST_TIMEOUT_MS = 8_000;

async function getJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      // Surface a status-bearing error so the caller can distinguish 404 from 5xx.
      const err = new Error(`Request to ${path} failed (${res.status})`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Published classes with a live cohort, optionally filtered by track. */
export function usePublicClasses(track?: ClassTrack) {
  return useQuery({
    queryKey: ["public-classes", track ?? "all"] as const,
    queryFn: async () => {
      const qs = track ? `?track=${track}` : "";
      const data = await getJson<{ classes: PublicClassListItem[] }>(`public-classes${qs}`);
      return data.classes ?? [];
    },
  });
}

/** The free Core-tier course outline (System A, via the A8 projection). */
export function usePublicCourses() {
  return useQuery({
    queryKey: ["public-courses"] as const,
    queryFn: async () => {
      const data = await getJson<{ courses: PublicCourse[] }>("public-courses");
      return data.courses ?? [];
    },
  });
}

/** A client shown on a public project opening (anon field set: no kind/status). */
export interface PublicProjectClient {
  id: string;
  name: string;
  logo_url: string | null;
}

/**
 * One visible project opening for a logged-out visitor. The fields are the
 * server-enforced anon set from the `public-project-openings` gateway
 * (PROJECT_CARD_ANON in _shared/public-visibility.ts) — there is deliberately NO
 * `phase`, no application stats, and no client `kind`/`status` here; those are
 * authed-only. `client` is joined in from the gateway's separate `clients` array.
 */
export interface PublicProjectOpening {
  id: string;
  client_id: string | null;
  project_type: string;
  project_status: string;
  team_hats: string[] | null;
  current_phase_milestones: string[] | null;
  friendly_name: string | null;
  description: string | null;
  is_shipathon: boolean | null;
  created_at: string;
  client: PublicProjectClient | null;
}

interface PublicProjectOpeningsResponse {
  projects: Omit<PublicProjectOpening, "client">[];
  clients: PublicProjectClient[];
}

/**
 * Visible project openings for a logged-out visitor, each joined to its client.
 * Reads the `public-project-openings` gateway (which owns the anon field set), NOT
 * the authed project service — anon has no table grants (A6). A distinct query key
 * from the authed ProjectOpeningsPage's own fetch (`["public-project-openings"]`)
 * so the two differently-shaped payloads never share a cache entry.
 */
export function usePublicProjectOpenings() {
  return useQuery({
    queryKey: ["public-project-openings", "catalog"] as const,
    queryFn: async () => {
      const data = await getJson<PublicProjectOpeningsResponse>("public-project-openings");
      const clientById = new Map((data.clients ?? []).map((c) => [c.id, c]));
      return (data.projects ?? []).map((p) => ({
        ...p,
        client: p.client_id ? clientById.get(p.client_id) ?? null : null,
      }));
    },
  });
}

/** One published class by slug (outline + cohorts). `null` when not found (404). */
export function usePublicClassDetail(slug: string | undefined) {
  return useQuery({
    queryKey: ["public-class-detail", slug ?? "none"] as const,
    enabled: !!slug,
    queryFn: async () => {
      try {
        return await getJson<{ class: PublicClassDetail; cohorts: PublicCohort[] }>(
          `public-class-detail?slug=${encodeURIComponent(slug!)}`,
        );
      } catch (e) {
        if ((e as { status?: number }).status === 404) return null;
        throw e;
      }
    },
  });
}

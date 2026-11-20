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

/** A class's enrollment state, derived from its (already published, future) cohorts. */
export type EnrollmentState = "open" | "coming_soon" | "none";

/** True when a cohort can be registered for right now. `live` = running but still joinable. */
export function isRegisterable(c: Pick<PublicCohort, "registration_status">): boolean {
  return c.registration_status === "register_now" || c.registration_status === "live";
}

/**
 * Classify a class by its cohorts: `open` (at least one registerable cohort),
 * else `coming_soon` (a published upcoming cohort not yet open), else `none`.
 * The gateway has already filtered to published, not-yet-ended cohorts, so a
 * `coming_soon` here is a real upcoming offering, not a draft.
 */
export function enrollmentStateOf(cohorts: readonly PublicCohort[] | null | undefined): EnrollmentState {
  const list = cohorts ?? [];
  if (list.some(isRegisterable)) return "open";
  if (list.some((c) => c.registration_status === "coming_soon")) return "coming_soon";
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

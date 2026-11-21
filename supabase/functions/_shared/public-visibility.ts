// Public visibility Strategy (public-access A5) — the single server-side source of
// truth for WHICH fields each auth state may see, per §6. Implements ADR-20261116
// ("visibility is a Strategy enforced server-side by the Gateway; presentation
// never decides"). The public gateways import their select from here instead of
// hardcoding it, so there is one place to audit and one place the A7 CI guard
// checks against.
//
// Two auth states for the PUBLIC surface:
//   - "anon"          : the strict §6 public set (a logged-out visitor).
//   - "authenticated" : the strict set PLUS operational fields that are fine to
//                       show any signed-in member but must not leak to anon
//                       (project.phase/requires_interview, cohort status/capacity/
//                       timezone, client status/kind). NOT secrets, NOT PII, and
//                       NOT enrolled-only data (e.g. cohort.meeting_url, lesson
//                       bodies, client.primary_contact) — those need their own
//                       authed/entitled paths, never this public gateway.
//
// Fail-safe rule (owasp): resolveAuthState widens to "authenticated" ONLY for a
// cryptographically valid, unexpired session. A missing, malformed, expired, or
// unverifiable token resolves to "anon" — a forged token can never widen the
// response.
import { extractBearerToken, getUserClient } from "./admin-client.ts";

export type AuthState = "anon" | "authenticated";

/** Columns every auth state may see, by resource (the strict §6 anon set). */
const ANON_FIELDS = {
  // owner_user_id is fetched only to derive instructor_name and dropped before output.
  class:
    "id, slug, track, status, title, summary, description, outcomes, skills, prerequisites, hero_image_url, short_description, deliverables, curriculum, published_at, owner_user_id",
  // registration_status (coming_soon|register_now|live|finished) is the PUBLIC
  // enrollment phase — anon needs it to show "open to register" vs "opening soon".
  // cohort_status (draft|published|…) stays authed-only below; anon never sees a
  // draft cohort because the gateways filter status='published' server-side.
  cohort: "id, label, start_date, end_date, registration_url, registration_status",
  // coordinator_id → derived name; client_id is the join key (not displayed).
  project:
    "id, client_id, project_type, project_status, team_hats, current_phase_milestones, created_at, timezone_range, anticipated_start_date, anticipated_end_date, coordinator_id, friendly_name, description",
  client: "id, name, website, mission, project_summary, logo_url",
  // Core-course OUTLINE (public-access A8) — System A (course_catalog/lesson_catalog).
  // Structure only, never lesson bodies (lesson copy lives client-side in
  // src/data/*, keyed by these slugs). These tables hold no PII/secrets; the
  // allowlist is still single-sourced here so A8 is held to the same §6 discipline
  // and the A7 guard validates every column the public-courses gateway selects.
  course: "course_key, display_label, display_order, phase, tier",
  // course_key is the embed join key (returned); never a lesson body/video/title.
  lesson: "lesson_id, course_key, display_order, required",
} as const;

/** Extra columns a signed-in member may see, appended to the anon set. */
const AUTHED_EXTRA = {
  class: "",
  cohort: "status, capacity, timezone",
  project: "phase, requires_interview",
  client: "status, kind",
  // Core-course outline is auth-invariant: anon and members see the same structure.
  course: "",
  lesson: "",
} as const;

export type PublicResource = keyof typeof ANON_FIELDS;

/**
 * The Strategy: the PostgREST select string for a resource at a given auth state.
 * anon → strict §6; authenticated → strict + the resource's authed-only extras.
 */
export function fieldsFor(resource: PublicResource, authState: AuthState): string {
  const base = ANON_FIELDS[resource];
  if (authState !== "authenticated") return base;
  const extra = AUTHED_EXTRA[resource];
  return extra ? `${base}, ${extra}` : base;
}

// --- List/card variants (narrower than the detail set) ---------------------
// Listing pages (project openings) need fewer columns than the detail view, so
// they can't use fieldsFor() directly. They still source their authed-only extras
// from HERE (a subset of AUTHED_EXTRA) rather than hardcoding them, so the
// "authed-only" decision stays single-sourced and the drift guard in the tests
// fails CI if a card extra ever stops being an authed-only field.
const PROJECT_CARD_ANON =
  "id, client_id, project_type, project_status, team_hats, current_phase_milestones, friendly_name, description, is_shipathon, created_at";
const CLIENT_CARD_ANON = "id, name, logo_url";

/** Project fields for a listing card. Anon = card subset; authed also gets phase. */
export function projectCardFields(authState: AuthState): string {
  return authState === "authenticated" ? `${PROJECT_CARD_ANON}, phase` : PROJECT_CARD_ANON;
}

/** Client fields for a listing card. Anon = name/logo; authed also gets kind. */
export function clientCardFields(authState: AuthState): string {
  return authState === "authenticated" ? `${CLIENT_CARD_ANON}, kind:kind::text` : CLIENT_CARD_ANON;
}

/** The authed-only extras for a resource, as an array (for tests / DLP / mapping). */
export function authedOnlyFields(resource: PublicResource): string[] {
  return AUTHED_EXTRA[resource]
    ? AUTHED_EXTRA[resource].split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

/**
 * Resolve the caller's auth state from an optional bearer token. Fail-safe:
 * returns "authenticated" ONLY when Supabase confirms a valid, unexpired user;
 * every other case (no token, malformed, expired, network/verify error) → "anon",
 * so a forged or stale token can never unlock the authenticated field set.
 */
export async function resolveAuthState(req: Request): Promise<AuthState> {
  const token = extractBearerToken(req);
  if (!token) return "anon"; // ordinary anonymous caller — no token, no log
  try {
    const result = await getUserClient(`Bearer ${token}`).auth.getUser();
    // A token was presented but did not verify — degrade to anon AND log, so an
    // auth/GoTrue outage (which would silently drop every signed-in caller to the
    // anon field set) is visible to SRE instead of invisible. Fires only when a
    // token was sent, so legitimate anon traffic stays quiet.
    if (result.error || !result.data?.user) {
      console.warn(JSON.stringify({
        level: "warn",
        action: "auth_resolve_degraded_to_anon",
        reason: result.error ? "getuser_error" : "no_user",
      }));
    }
    return authStateFromUserResult(result);
  } catch (e) {
    console.warn(JSON.stringify({
      level: "warn",
      action: "auth_resolve_degraded_to_anon",
      reason: "exception",
      msg: (e as Error)?.message?.slice(0, 120),
    }));
    return "anon";
  }
}

/**
 * Pure fail-safe decision (extracted so it can be unit-tested): widen to
 * "authenticated" ONLY when there is no error AND a user object is present.
 * Every other shape (null, an error, no user) → "anon".
 */
export function authStateFromUserResult(
  result: { data?: { user?: unknown } | null; error?: unknown } | null | undefined,
): AuthState {
  return result && !result.error && result.data && result.data.user ? "authenticated" : "anon";
}

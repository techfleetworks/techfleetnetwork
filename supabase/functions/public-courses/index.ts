// @edge-public
// Public, UNAUTHENTICATED read-only LIST of the free Core-course OUTLINE
// (public-access A8) — System A (course_catalog + lesson_catalog).
//
// Why this exists
// ---------------
// The Core training courses live only in `course_catalog`/`lesson_catalog`, whose
// RLS is `SELECT TO authenticated` — a logged-out visitor reads nothing directly.
// They are UNLINKED to the paid `classes`/`cohorts` system (no course_key on
// classes, no class_id on course_catalog), so the public class gateway cannot
// serve them. This is the dedicated server-side path that projects the same free
// Core courses the signed-in journey shows (the catalog read behind
// use-course-catalog-prep — here with the lesson outline embedded) to anon, so the
// public "Onboarding Courses" tab (B10) renders the same courses the journey does.
//
// Core courses are FREE: no price, no cohort, no Gumroad, no registration. This
// gateway serves STRUCTURE ONLY (course + lesson order/metadata); lesson copy
// lives client-side in src/data/*, keyed by these slugs. No lesson bodies/titles
// ever leave the server here.
//
// Hardened like the other public gateways: WAF + service-role admin client +
// EXPLICIT §6 column allowlist (sourced from public-visibility.ts, validated by
// the A7 CI guard) + scrubTree output DLP + structured error auditing + edge
// cache. anon has zero table privileges after the A8 REVOKE, so this service-role
// gateway is the only anon read path.
//
// Ticket 34c1a3bddce58092864bc1ac090fe335 (A8 / B10 / B12).
// ADR 20261118-public-domain-bounded-contexts, 20261118-public-courses-gateway.
import { applyWaf } from "../_shared/waf.ts";
import { scrubTree } from "../_shared/dlp.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { withAuditWrapper } from "../_shared/audit.ts";
import {
  handleCors,
  methodNotAllowed,
  jsonResponse,
  cachedJsonResponse,
  errorResponse,
} from "../_shared/http.ts";

// Public feed CDN cache: 60s edge cache, serve stale for a day while revalidating.
const PUBLIC_FEED_CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=86400";

interface LessonRow {
  lesson_id: string;
  course_key: string;
  display_order: number;
  required: boolean;
}
interface CourseRow {
  course_key: string;
  display_label: string;
  display_order: number;
  phase: string;
  tier: string;
  lessons: LessonRow[] | null;
}

Deno.serve(withAuditWrapper("public-courses", async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "GET") return methodNotAllowed();

  // WAF: rate-limit / size / scanner / SQLi / path-traversal. Public anon endpoint.
  const blocked = await applyWaf(req, "public-courses");
  if (blocked) return blocked;

  try {
    const supabase = getAdminClient();

    // §6 anon allowlist — a LITERAL select so the A7 guard validates every column
    // against ANON_FIELDS (course/lesson). Outline only: course_key + label +
    // order + phase/tier, with the lesson structure embedded. No lesson bodies.
    // Only free, active, core-tier courses (onboarding/Connect Discord/Welcome are
    // excluded by the tier filter); lessons are active + ordered.
    const { data, error } = await supabase
      .from("course_catalog")
      .select(
        `course_key, display_label, display_order, phase, tier,
         lessons:lesson_catalog(lesson_id, course_key, display_order, required)`
      )
      .eq("active", true)
      .eq("tier", "core")
      // Filter the embed too: a deactivated lesson must not appear in the public
      // outline (left join, so a course with no active lessons still shows, empty).
      // `active` is deliberately NOT in the select allowlist, so this predicate —
      // not a JS filter — is the only place it can be applied. Mirrors
      // public-classes' `.eq('cohorts.status','published')` embed filter.
      .eq("lessons.active", true)
      .order("display_order", { ascending: true });

    if (error) {
      console.error("public-courses query error:", error);
      return jsonResponse({ error: "Failed to load courses" }, 500);
    }

    const courses = ((data ?? []) as CourseRow[]).map((c) => ({
      course_key: c.course_key,
      display_label: c.display_label,
      display_order: c.display_order,
      phase: c.phase,
      tier: c.tier,
      lessons: (c.lessons ?? [])
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    }));

    const payload = { generated_at: new Date().toISOString(), count: courses.length, courses };

    // DLP: scrub every free-text leaf (display_label is admin-authored prose; a
    // stray email/token would be redacted). The outline carries no URL keys and no
    // UUIDs (course_key/lesson_id are kebab-case slugs), so no allowlist is needed.
    return cachedJsonResponse(scrubTree(payload), PUBLIC_FEED_CACHE);
  } catch (err) {
    console.error("public-courses unexpected:", err);
    return errorResponse(err, "Internal server error");
  }
}));

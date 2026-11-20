// @edge-cron
// Public, UNAUTHENTICATED class-detail gateway (D-A, public-access A2+A3).
//
// This is the single server-side gatekeeper for a logged-out class page. It runs
// under the service role (bypasses RLS) so it can apply an EXPLICIT §6 column
// allowlist + output DLP, instead of letting anon read `classes` directly via
// PostgREST (which today exposes every column). The anon direct-read path is
// revoked separately in A6 (REVOKE ALL ON public.classes FROM anon) once every
// public reader goes through a gateway like this one.
//
// Mirrors the hardened public-project-detail pattern: WAF + service-role admin
// client + explicit select allowlist + scrubTree DLP (free-text leaves; URL keys
// preserved) + derived display names.
// The Framer marketing feed (public-classes) is a SEPARATE Adapter and is left
// untouched here.
//
// Ticket 34c1a3bddce58092864bc1ac090fe335 §6, §6.1, §6.3. ADR 20261116-public-class-gateway.
import { applyWaf } from "../_shared/waf.ts";
import { scrubTree } from "../_shared/dlp.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { withAuditWrapper } from "../_shared/audit.ts";
import { fieldsFor, resolveAuthState } from "../_shared/public-visibility.ts";
import { handleCors, jsonResponse, cachedJsonResponse, errorResponse } from "../_shared/http.ts";
import { deriveInstructorName, toPublicClass, toPublicCohort } from "./lib.ts";

// Public feed CDN cache: 60s edge cache, serve stale for a day while revalidating.
const PUBLIC_FEED_CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=86400";

Deno.serve(withAuditWrapper("public-class-detail", async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // WAF: rate-limit / size / scanner / SQLi / path-traversal protection.
  // Public unauthenticated endpoint — prime target for enumeration/abuse.
  const blocked = await applyWaf(req, "public-class-detail");
  if (blocked) return blocked;

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    // Slugs are server-generated lowercase kebab-case; validate tightly.
    if (!slug || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) {
      return jsonResponse({ error: "Invalid or missing slug" }, 400);
    }

    const supabase = getAdminClient();

    // Auth-aware (A5): the §6 field set comes from the shared visibility policy.
    // Class has no authed-only extras; owner_user_id is selected only to derive the
    // instructor name and dropped below. Fail-safe to anon for any invalid token.
    const authState = await resolveAuthState(req);

    const { data: clsRaw, error: clsErr } = await supabase
      .from("classes")
      .select(fieldsFor("class", authState))
      .eq("slug", slug)
      .eq("status", "published")
      .maybeSingle();

    if (clsErr) throw clsErr;
    const cls = clsRaw as unknown as
      | (Record<string, unknown> & { id: string; owner_user_id: string | null })
      | null;
    if (!cls) {
      return jsonResponse({ error: "Class not found" }, 404);
    }

    // Derive instructor display name; never expose owner_user_id.
    let instructorName: string | null = null;
    if (cls.owner_user_id) {
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("display_name, first_name, last_name")
        .eq("user_id", cls.owner_user_id)
        .maybeSingle();
      // Report + recover (prime directive #4): the instructor name is cosmetic, so
      // a profiles RLS/schema/transient fault must NOT blank the whole class page.
      // Surface it to the edge logs (so SRE sees it) and degrade to no name — never
      // silently drop the error (no-dropped-supabase-error).
      if (profErr) {
        console.warn(JSON.stringify({
          level: "warn",
          fn: "public-class-detail",
          action: "instructor_lookup_failed",
          reason: profErr.message?.slice(0, 120),
        }));
      }
      instructorName = deriveInstructorName(prof);
    }

    // Cohorts — only published, not-yet-ended ones are shown; the client reads
    // registration_status to tell "register now" from "opening soon". Anon gets
    // id/label/dates/registration_url/registration_status; a signed-in member also
    // gets cohort_status/capacity/timezone (§6 authed-only). meeting_url and
    // plumbing are never selected.
    const today = new Date().toISOString().slice(0, 10);
    const { data: cohortRows, error: cohortErr } = await supabase
      .from("cohorts")
      .select(fieldsFor("cohort", authState))
      .eq("class_id", cls.id)
      .eq("status", "published")
      .gte("end_date", today)
      .order("start_date", { ascending: true });

    if (cohortErr) throw cohortErr;

    const cohorts = ((cohortRows ?? []) as unknown as Parameters<typeof toPublicCohort>[0][]).map(
      (c) => toPublicCohort(c, authState),
    );
    const payload = { class: toPublicClass(cls, instructorName), cohorts };

    // DLP: scrub every free-text leaf (emails / tokens / stray ids that could slip
    // into teacher-authored prose). URL/path leaves (hero_image_url,
    // registration_url) are preserved by key so storage hashes aren't corrupted,
    // and the legit class + cohort ids pass via the allowlist.
    const scrubbed = scrubTree(payload, { uuids: [cls.id, ...cohorts.map((c) => c.id)] });

    return cachedJsonResponse(scrubbed, PUBLIC_FEED_CACHE);
  } catch (err) {
    console.error("public-class-detail error:", err);
    return errorResponse(err, "Internal server error");
  }
}));

// @edge-cron
// Public, unauthenticated read-only LIST feed of published classes + their open
// cohorts (public-access A6). Runs under the SERVICE ROLE — anon has no table
// grants after the REVOKE — and serves the §6 anon field set (validated by the A7
// allowlist guard), with CORS + edge cache headers. Groundwork for the platform's
// own public classes list (Framer is being retired).
//
// CORS/responses come from _shared/http.ts (handleCors / cachedJsonResponse /
// errorResponse), NOT a hand-rolled allow-list. A hand-rolled list that omits a
// header the client sends (the frontend attaches `apikey`, and invokeEdge adds
// `x-trace-id`) makes the browser REJECT the preflight — OPTIONS returns 200 but
// the actual GET is blocked with a CORS error and the tab shows "could not load"
// (this exact bug: the old inline list allowed only `content-type`). The shared
// headers list authorization/x-client-info/apikey/content-type/x-trace-id/
// x-request-id, so every public caller's preflight passes. Enforced by
// scripts/ci/check-edge-cors-trace.mjs (public-* gateways must not hand-roll CORS).

import { getAdminClient } from "../_shared/admin-client.ts";
import { withAuditWrapper } from "../_shared/audit.ts";
import { handleCors, cachedJsonResponse, methodNotAllowed, errorResponse } from "../_shared/http.ts";

// Public feed CDN cache: 60s edge cache, serve stale for a day while revalidating.
const PUBLIC_FEED_CACHE = "public, max-age=60, s-maxage=60, stale-while-revalidate=86400";

Deno.serve(withAuditWrapper("public-classes", async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "GET") return methodNotAllowed();

  try {
    const url = new URL(req.url);
    const trackParam = url.searchParams.get("track");
    const validTracks = new Set(["basic_training", "advanced_training"]);
    const track = trackParam && validTracks.has(trackParam) ? trackParam : null;

    // Service-role client (anon has no grants after the A6 REVOKE). §6-compliant
    // anon select: no owner_user_id, and cohorts reduced to label/dates/
    // registration_url (status/capacity/timezone are authed-only, not in an anon
    // feed). The A7 guard validates these columns are within the anon allowlist.
    const supabase = getAdminClient();

    let q = supabase
      .from("classes")
      .select(`
        id, slug, title, summary, description, track, hero_image_url,
        outcomes, skills, prerequisites, published_at,
        cohorts:cohorts!inner(id, label, start_date, end_date, registration_url)
      `)
      .eq("status", "published")
      .eq("cohorts.status", "published")
      .gte("cohorts.end_date", new Date().toISOString().slice(0, 10))
      .order("published_at", { ascending: false });

    if (track) q = q.eq("track", track);

    const { data, error } = await q;
    if (error) {
      console.error("public-classes query error:", error);
      return errorResponse(error, "Failed to load classes", 500);
    }

    const classes = (data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      cohorts: ((c.cohorts as Array<{ start_date?: string }> | null) ?? [])
        .slice()
        .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "")),
    }));

    return cachedJsonResponse(
      { generated_at: new Date().toISOString(), count: classes.length, classes },
      PUBLIC_FEED_CACHE,
    );
  } catch (err) {
    console.error("public-classes unexpected:", err);
    return errorResponse(err, "Unexpected error");
  }
}));

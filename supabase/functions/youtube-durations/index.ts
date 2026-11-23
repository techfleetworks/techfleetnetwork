// Public, unauthenticated YouTube video DURATIONS lookup (public-access B12).
//
// The public Core-course pages show each video lesson's length. YouTube durations
// are not in our DB and can't be fetched from the browser (the API key would be
// exposed and CORS/quota would bite). This gateway fetches them server-side with
// YOUTUBE_API_KEY (a Supabase secret, never shipped to the client), for a batch of
// video ids the caller passes, and caches hard — a video's length is immutable.
//
// Fail-safe: if the key is unset or YouTube errors, it returns an EMPTY map with
// 200, so the course page still renders (it just omits the length) — recover +
// report, never break the page over a cosmetic field. No key or PII is ever logged.
//
// CORS/responses come from _shared/http.ts; WAF guards abuse (it is anon + public).
import { applyWaf } from "../_shared/waf.ts";
import { withAuditWrapper } from "../_shared/audit.ts";
import { handleCors, cachedJsonResponse, methodNotAllowed } from "../_shared/http.ts";
import { parseIds, durationsFromResponse } from "./lib.ts";

// Durations never change: cache a week at the edge, a day in the browser.
const DURATIONS_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

Deno.serve(withAuditWrapper("youtube-durations", async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== "GET") return methodNotAllowed();

  const blocked = await applyWaf(req, "youtube-durations");
  if (blocked) return blocked;

  const ids = parseIds(new URL(req.url).searchParams.get("ids"));
  let durations: Record<string, number> = {};
  let degraded = false; // true when we could NOT get real lengths (no key / YouTube error)

  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (ids.length > 0) {
    if (!key) {
      degraded = true; // key not configured yet — do not hard-cache the empty result
    } else {
      try {
        const url = new URL("https://www.googleapis.com/youtube/v3/videos");
        url.searchParams.set("part", "contentDetails");
        url.searchParams.set("id", ids.join(","));
        url.searchParams.set("key", key);
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) {
          // Status only (safe); recover with an empty map.
          degraded = true;
          console.error(`youtube-durations: YouTube API HTTP ${res.status}`);
        } else {
          durations = durationsFromResponse(await res.json());
        }
      } catch (err) {
        // Log the error CLASS only, never err.message: a Deno fetch error can embed
        // the outbound URL, which carries `&key=<secret>`. Console-only is deliberate
        // — no-key is an expected pre-config state and a missing length is cosmetic,
        // so this isn't audited (avoids steady-state noise).
        degraded = true;
        console.error("youtube-durations: lookup failed:", (err as Error)?.name ?? "error");
      }
    }
  }

  // Always 200 so the page renders. Cache a SUCCESSFUL lookup hard (lengths are
  // immutable); cache a DEGRADED result briefly so real lengths appear soon after the
  // key is set or YouTube recovers, instead of poisoning the edge for a week.
  const cache = degraded ? "public, max-age=60" : DURATIONS_CACHE;
  return cachedJsonResponse({ durations }, cache);
}));

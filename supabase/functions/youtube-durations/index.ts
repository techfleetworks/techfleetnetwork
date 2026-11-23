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

  const key = Deno.env.get("YOUTUBE_API_KEY");
  if (ids.length > 0 && key) {
    try {
      const url = new URL("https://www.googleapis.com/youtube/v3/videos");
      url.searchParams.set("part", "contentDetails");
      url.searchParams.set("id", ids.join(","));
      url.searchParams.set("key", key);
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        // Report (never the key or body verbatim) + recover with an empty map.
        console.error(`youtube-durations: YouTube API HTTP ${res.status}`);
      } else {
        durations = durationsFromResponse(await res.json());
      }
    } catch (err) {
      console.error("youtube-durations: lookup failed:", (err as Error)?.message?.slice(0, 120));
    }
  }

  // Always 200 (even empty) so the page renders; cache so YouTube quota is tiny.
  return cachedJsonResponse({ durations }, DURATIONS_CACHE);
}));

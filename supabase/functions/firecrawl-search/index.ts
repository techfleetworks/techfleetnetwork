import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { normalizeFirecrawlResults, parseFirecrawlSearchRequest } from "./validation.ts";

const log = createEdgeLogger("firecrawl-search");
const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v1/search";
const REQUEST_TIMEOUT_MS = 8_000;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    const parsed = parseFirecrawlSearchRequest(await parseJsonBody(req, 2 * 1024));
    if (parsed instanceof Response) return parsed;

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
      log.error("connector_not_configured", "Firecrawl connector is missing required configuration");
      return jsonResponse({ success: false, error: "Search connector not configured" }, 500);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(FIRECRAWL_SEARCH_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: parsed.query,
          limit: parsed.limit,
          scrapeOptions: { formats: ["markdown"] },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      log.warn("provider_search_failed", "External search provider returned a non-success status", { status: response.status });
      const safeStatus = response.status === 429 ? 429 : 502;
      return jsonResponse({ success: false, error: "Search request failed" }, safeStatus);
    }

    return jsonResponse({ success: true, results: normalizeFirecrawlResults(data, parsed.limit) });
  } catch (error) {
    log.error("search_failed", "External search request failed", undefined, error);
    return errorResponse(error, "Search failed");
  }
});

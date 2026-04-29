import { getAdminClient } from "../_shared/admin-client.ts";
import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { parseExplorationCachePayload } from "./validation.ts";

const log = createEdgeLogger("write-exploration-cache");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    const parsed = parseExplorationCachePayload(await parseJsonBody(req, 36 * 1024));
    if (parsed instanceof Response) return parsed;

    // Use service role to write to the cache
    const serviceClient = getAdminClient();

    const { error: upsertError } = await serviceClient
      .from("exploration_cache")
      .upsert(
        { query_normalized: parsed.query_normalized, response_markdown: parsed.response_markdown },
        { onConflict: "query_normalized" },
      );

    if (upsertError) {
      log.error("cache_write", "Cache upsert failed", { userId: auth.userId }, upsertError);
      return jsonResponse({ error: "Cache write failed" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    log.error("handler", "Unhandled cache write error", undefined, err);
    return errorResponse(err);
  }
});

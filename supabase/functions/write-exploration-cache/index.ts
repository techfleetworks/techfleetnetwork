import { getAdminClient } from "../_shared/admin-client.ts";
import { scrub } from "../_shared/dlp.ts";
import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";

const log = createEdgeLogger("write-exploration-cache");

const QUERY_MAX_CHARS = 500;
const RESPONSE_MAX_CHARS = 32_768;
const QUERY_PATTERN = /^[\p{L}\p{N}\s.,!?;:'"()\[\]{}\-_/@#&+%$]{1,500}$/u;

export interface ExplorationCachePayload {
  query_normalized: string;
  response_markdown: string;
}

export function parseExplorationCachePayload(body: unknown): ExplorationCachePayload | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const record = body as Record<string, unknown>;
  const queryNormalized = typeof record.query_normalized === "string" ? record.query_normalized.trim() : "";
  const responseMarkdown = typeof record.response_markdown === "string" ? record.response_markdown.trim() : "";

  if (!queryNormalized || !responseMarkdown) {
    return jsonResponse({ error: "query_normalized and response_markdown are required" }, 400);
  }
  if (queryNormalized.length > QUERY_MAX_CHARS || !QUERY_PATTERN.test(queryNormalized)) {
    return jsonResponse({ error: "query_normalized contains unsupported characters" }, 400);
  }
  if (responseMarkdown.length > RESPONSE_MAX_CHARS) {
    return jsonResponse({ error: "response_markdown is too large" }, 413);
  }

  return {
    query_normalized: queryNormalized,
    response_markdown: scrub(responseMarkdown),
  };
}

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

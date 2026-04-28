import { getAdminClient } from "../_shared/admin-client.ts";
import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    // Parse & validate body
    const body = await parseJsonBody(req);
    const queryNormalized = typeof body.query_normalized === "string"
      ? body.query_normalized.trim().slice(0, 500)
      : "";
    const responseMarkdown = typeof body.response_markdown === "string"
      ? body.response_markdown.slice(0, 32_768)
      : "";

    if (!queryNormalized || !responseMarkdown) {
      return jsonResponse({ error: "query_normalized and response_markdown are required" }, 400);
    }

    // Use service role to write to the cache
    const serviceClient = getAdminClient();

    const { error: upsertError } = await serviceClient
      .from("exploration_cache")
      .upsert(
        { query_normalized: queryNormalized, response_markdown: responseMarkdown },
        { onConflict: "query_normalized" },
      );

    if (upsertError) {
      console.error("write-exploration-cache upsert failed:", upsertError);
      return jsonResponse({ error: "Cache write failed" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    console.error("write-exploration-cache error:", err);
    return errorResponse(err);
  }
});

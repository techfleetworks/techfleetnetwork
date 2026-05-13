import { z } from "npm:zod@4.3.6";
import { getAdminClient } from "../_shared/admin-client.ts";
import { errorResponse, handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";

import { withAuditWrapper } from "../_shared/audit.ts";

// M-01: Lenient shape guard. Existing per-field length/type checks below stay authoritative.
const BodySchema = z.object({
  query_normalized: z.string().optional(),
  response_markdown: z.string().optional(),
}).passthrough();
Deno.serve(withAuditWrapper("write-exploration-cache", async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) return auth;

    // Parse & validate body
    const body = await parseJsonBody(req) as Record<string, unknown>;
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
}));

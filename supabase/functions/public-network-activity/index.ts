import { handleCors, jsonResponse, methodNotAllowed, parseJsonBody } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/admin-client.ts";

type PublicAction = "network_stats" | "country_distribution";

function parseAction(value: unknown): PublicAction | null {
  const action = typeof value === "object" && value !== null && "action" in value
    ? (value as { action?: unknown }).action
    : null;
  if (action === "network_stats" || action === "country_distribution") return action;
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  let body: unknown;
  try {
    body = await parseJsonBody(req, 1024);
  } catch (error) {
    return error instanceof Response ? error : jsonResponse({ error: "Invalid request" }, 400);
  }

  const action = parseAction(body);
  if (!action) return jsonResponse({ error: "Invalid action" }, 400);

  const admin = getAdminClient();
  const rpc = action === "network_stats" ? "get_network_stats" : "get_member_country_distribution";
  const { data, error } = await admin.rpc(rpc);

  if (error) {
    console.error(JSON.stringify({ level: "error", action: "public_network_activity", rpc }));
    return jsonResponse({ error: "Unable to load network activity" }, 500);
  }

  return jsonResponse({ data }, 200);
});

import { handleCors, jsonResponse, methodNotAllowed, parseJsonBody } from "../_shared/http.ts";
import { getAdminClient } from "../_shared/admin-client.ts";
import { requireAdminRequest } from "../_shared/request-auth.ts";

const MAX_HOURS = 720;
const MAX_LIMIT = 100;

type Action = "evaluate" | "run_remediations" | "email_pipeline_health";

interface RequestBody {
  action?: unknown;
  hours?: unknown;
  limit?: unknown;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function parseAction(value: unknown): Action | null {
  if (value === "evaluate" || value === "run_remediations" || value === "email_pipeline_health") {
    return value;
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return methodNotAllowed();

  const auth = await requireAdminRequest(req);
  if (auth instanceof Response) return auth;

  let body: RequestBody;
  try {
    body = await parseJsonBody(req, 4 * 1024) as RequestBody;
  } catch (error) {
    return error instanceof Response ? error : jsonResponse({ error: "Invalid request" }, 400);
  }

  const action = parseAction(body.action);
  if (!action) return jsonResponse({ error: "Invalid action" }, 400);

  const admin = getAdminClient();

  if (action === "evaluate") {
    const { data, error } = await admin.rpc("evaluate_system_health");
    if (error) return jsonResponse({ error: "Unable to evaluate system health" }, 500);
    return jsonResponse({ data });
  }

  if (action === "run_remediations") {
    const { data, error } = await admin.rpc("run_auto_remediations");
    if (error) return jsonResponse({ error: "Unable to run remediations" }, 500);
    return jsonResponse({ data });
  }

  const hours = clampInteger(body.hours, 24, 1, MAX_HOURS);
  const limit = clampInteger(body.limit, 50, 1, MAX_LIMIT);
  const { data, error } = await admin.rpc("get_email_pipeline_health", {
    p_hours: hours,
    p_limit: limit,
  });
  if (error) return jsonResponse({ error: "Unable to load email pipeline health" }, 500);
  return jsonResponse({ data });
});

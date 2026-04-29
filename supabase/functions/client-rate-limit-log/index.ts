import { createEdgeLogger } from "../_shared/logger.ts";
import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { parseClientRateLimitLogPayload } from "./validation.ts";

const log = createEdgeLogger("client-rate-limit-log");

function clientIpFamily(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  if (forwarded.includes(":")) return "ipv6";
  if (forwarded.includes(".")) return "ipv4";
  return "unknown";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const payload = parseClientRateLimitLogPayload(await parseJsonBody(req, 2_000));
    if (payload instanceof Response) return payload;

    log.warn("client-rate-limit-hit", "Client-side rate limit blocked a request", {
      requestId,
      reason: payload.reason,
      method: payload.method,
      path: payload.path,
      retryAfterSeconds: payload.retryAfterSeconds,
      captchaRequired: payload.captchaRequired,
      surface: payload.surface,
      ipFamily: clientIpFamily(req),
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    log.warn("client-rate-limit-hit", "Invalid client rate-limit telemetry payload", { requestId }, err);
    return jsonResponse({ error: "Bad request" }, 400);
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.99.1";
import { createEdgeLogger } from "../_shared/logger.ts";
import { handleCors, jsonResponse, parseJsonBody } from "../_shared/http.ts";
import { parseRateLimitRequest } from "./validation.ts";

const log = createEdgeLogger("rate-limit");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`, { requestId });

  try {
    const parsed = parseRateLimitRequest(await parseJsonBody(req, 1024));
    if (parsed instanceof Response) return parsed;
    const { identifier, action } = parsed;

    log.info("check", `Checking rate limit for action "${action}" [${requestId}]`, { requestId, action });

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceRoleKey) return jsonResponse({ error: "Rate limit is not configured" }, 500);

    const encoder = new TextEncoder();
    const data = encoder.encode(identifier + serviceRoleKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedIdentifier = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    const { data: result, error } = await supabase.rpc("check_rate_limit", {
      p_identifier: hashedIdentifier,
      p_action: action,
      p_max_attempts: action === "login_attempt" ? 5 : 3,
      p_window_minutes: 15,
      p_block_minutes: action === "login_attempt" ? 30 : 60,
    });

    if (error) {
      log.error("check", `Rate limit RPC failed [${requestId}] — failing open`, { requestId, action }, error);
      return jsonResponse({ allowed: true, remaining: 0, retry_after: 0 });
    }

    if (!result.allowed) {
      log.warn("check", `Rate limit exceeded [${requestId}]`, {
        requestId,
        action,
        allowed: result.allowed,
        remaining: result.remaining,
        retryAfter: result.retry_after,
      });
    } else {
      log.info("check", `Rate limit OK [${requestId}]`, {
        requestId,
        action,
        remaining: result.remaining,
      });
    }

    const response = jsonResponse(result);
    if (result.retry_after > 0) response.headers.set("Retry-After", String(result.retry_after));
    return response;
  } catch (err) {
    if (err instanceof Response) return err;
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return jsonResponse({ error: "Bad request" }, 400);
  }
});

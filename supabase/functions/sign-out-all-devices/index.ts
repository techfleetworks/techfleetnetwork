import { getAdminClient } from "../_shared/admin-client.ts";
import { errorResponse, handleCors, jsonResponse } from "../_shared/http.ts";
import { requireAuthenticatedRequest } from "../_shared/request-auth.ts";
import { createEdgeLogger } from "../_shared/logger.ts";

const log = createEdgeLogger("sign-out-all-devices");

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const requestId = crypto.randomUUID().substring(0, 8);
  log.info("handler", `Request received [${requestId}]`, { requestId });

  try {
    const auth = await requireAuthenticatedRequest(req);
    if (auth instanceof Response) {
      log.warn("auth", `Missing Authorization header [${requestId}]`, { requestId });
      return auth;
    }

    log.info("revoke", `Revoking all sessions for user ${auth.userId} [${requestId}]`, { requestId, userId: auth.userId });

    const { error: signOutError } = await getAdminClient().auth.admin.signOut(auth.userId, "global");
    if (signOutError) {
      log.error("revoke", `Failed to revoke sessions for user ${auth.userId} [${requestId}]: ${signOutError.message}`, { requestId, userId: auth.userId }, signOutError);
      return jsonResponse({ error: "Failed to revoke sessions" }, 500);
    }

    log.info("revoke", `All sessions revoked for user ${auth.userId} [${requestId}]`, { requestId, userId: auth.userId });
    return jsonResponse({ success: true, message: "All sessions revoked" });
  } catch (err) {
    log.error("handler", `Unhandled exception [${requestId}]`, { requestId }, err);
    return errorResponse(err, "Internal error");
  }
});

import {
  errorResponse,
  handleCors,
  jsonResponse,
  parseJsonBody,
} from "../_shared/http.ts";
import { createEdgeLogger } from "../_shared/logger.ts";
import {
  isTurnstileProviderSuccess,
  parseTurnstileVerificationRequest,
  sanitizeTurnstileErrorCodes,
  type TurnstileProviderResult,
} from "./validation.ts";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const REQUEST_TIMEOUT_MS = 5_000;
const log = createEdgeLogger("verify-turnstile");

// @public-route Browser pre-auth verification endpoint. Authorization is the Cloudflare Turnstile token.

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    log.error("secret_missing", "Turnstile verification secret is not configured");
    return jsonResponse({
      success: false,
      error: "Verification is not configured",
    }, 500);
  }

  try {
    const parsed = parseTurnstileVerificationRequest(await parseJsonBody(req, 8 * 1024));
    if (parsed instanceof Response) return parsed;

    const form = new FormData();
    form.set("secret", secret);
    form.set("response", parsed.token);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(VERIFY_URL, { method: "POST", body: form, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const result = await response.json().catch(() => ({})) as TurnstileProviderResult;
    if (!response.ok || !isTurnstileProviderSuccess(result, parsed.action)) {
      log.warn("verification_failed", "Turnstile verification failed", {
        action: parsed.action,
        status: response.status,
        errorCodes: sanitizeTurnstileErrorCodes(result["error-codes"]),
      });
      return jsonResponse({
        success: false,
        error: "Complete the human verification before trying again.",
      }, 403);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    log.error("verification_error", "Turnstile verification request failed", undefined, error);
    if (error instanceof Response) return error;
    return errorResponse(error, "Verification failed. Please try again.");
  }
});

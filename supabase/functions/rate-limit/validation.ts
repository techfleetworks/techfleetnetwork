import { jsonResponse } from "../_shared/http.ts";

const VALID_ACTIONS = new Set(["login_attempt", "signup_attempt", "password_reset"]);
const HASH_PATTERN = /^[a-f0-9]{64}$/i;
const IDENTIFIER_PATTERN = /^[\p{L}\p{N}\s@._:+\-]{3,255}$/u;

export interface RateLimitRequest {
  identifier: string;
  action: "login_attempt" | "signup_attempt" | "password_reset";
}

export function parseRateLimitRequest(body: unknown): RateLimitRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const record = body as Record<string, unknown>;
  const identifier = typeof record.identifier === "string" ? record.identifier.trim().toLowerCase() : "";
  const action = typeof record.action === "string" ? record.action.trim() : "";

  if (!identifier || identifier.length > 255) {
    return jsonResponse({ error: "Invalid identifier" }, 400);
  }
  if (!HASH_PATTERN.test(identifier) && !IDENTIFIER_PATTERN.test(identifier)) {
    return jsonResponse({ error: "Invalid identifier" }, 400);
  }
  if (!VALID_ACTIONS.has(action)) {
    return jsonResponse({ error: "Invalid action" }, 400);
  }

  return { identifier, action: action as RateLimitRequest["action"] };
}

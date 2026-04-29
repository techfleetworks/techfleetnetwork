import { jsonResponse } from "../_shared/http.ts";

const VALID_REASONS = new Set(["auth_lockout", "auth_throttle_captcha", "request_throttle"]);
const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const PATH_RE = /^\/(?:auth|rest|functions)\/v1\/[a-z0-9_\-\/]*$/i;
const SURFACE_RE = /^[a-z0-9_\-:.]{1,64}$/i;
const MAX_RETRY_AFTER_SECONDS = 86_400;

export interface ClientRateLimitLogPayload {
  reason: "auth_lockout" | "auth_throttle_captcha" | "request_throttle";
  method: string;
  path: string;
  retryAfterSeconds: number;
  captchaRequired: boolean;
  surface: string;
}

function cleanRetryAfter(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(MAX_RETRY_AFTER_SECONDS, Math.round(parsed)));
}

export function parseClientRateLimitLogPayload(body: unknown): ClientRateLimitLogPayload | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const record = body as Record<string, unknown>;
  const reason = typeof record.reason === "string" && VALID_REASONS.has(record.reason)
    ? record.reason as ClientRateLimitLogPayload["reason"]
    : "request_throttle";
  const method = typeof record.method === "string" && VALID_METHODS.has(record.method.toUpperCase())
    ? record.method.toUpperCase()
    : "UNKNOWN";
  const path = typeof record.path === "string" && PATH_RE.test(record.path)
    ? record.path
    : "/redacted";
  const surface = typeof record.surface === "string" && SURFACE_RE.test(record.surface)
    ? record.surface.slice(0, 64)
    : "unknown";

  return {
    reason,
    method,
    path,
    retryAfterSeconds: cleanRetryAfter(record.retryAfterSeconds),
    captchaRequired: record.captchaRequired === true,
    surface,
  };
}

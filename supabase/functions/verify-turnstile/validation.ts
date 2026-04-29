import { jsonResponse } from "../_shared/http.ts";

const TOKEN_PATTERN = /^[A-Za-z0-9._\-]+$/;
const ALLOWED_ACTIONS = new Set([
  "login",
  "register",
  "forgot_password",
  "signup_confirmation_resend",
]);
const ALLOWED_ERROR_CODES = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "missing-input-response",
  "invalid-input-response",
  "bad-request",
  "timeout-or-duplicate",
  "internal-error",
]);

export interface TurnstileVerificationRequest {
  token: string;
  action: string;
}

export interface TurnstileProviderResult {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: unknown;
}

export function parseTurnstileVerificationRequest(body: unknown): TurnstileVerificationRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ success: false, error: "Complete the human verification before trying again." }, 400);
  }

  const record = body as Record<string, unknown>;
  const token = typeof record.token === "string" ? record.token.trim() : "";
  const action = typeof record.action === "string" ? record.action.trim() : "";

  if (token.length < 20 || token.length > 4096 || !TOKEN_PATTERN.test(token) || !ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ success: false, error: "Complete the human verification before trying again." }, 400);
  }

  return { token, action };
}

export function sanitizeTurnstileErrorCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((code): code is string => typeof code === "string" && ALLOWED_ERROR_CODES.has(code))
    .slice(0, 5);
}

export function isTurnstileProviderSuccess(result: TurnstileProviderResult, expectedAction: string): boolean {
  if (result.success !== true) return false;
  if (typeof result.action === "string" && result.action !== expectedAction) return false;
  return true;
}

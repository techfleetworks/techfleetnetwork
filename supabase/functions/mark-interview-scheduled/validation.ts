import { jsonResponse } from "../_shared/http.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export interface MarkInterviewScheduledRequest {
  application_id: string;
}

export function parseMarkInterviewScheduledRequest(body: unknown): MarkInterviewScheduledRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const applicationId = (body as Record<string, unknown>).application_id;
  if (typeof applicationId !== "string" || !UUID_PATTERN.test(applicationId.trim())) {
    return jsonResponse({ error: "Invalid application_id" }, 400);
  }

  return { application_id: applicationId.trim().toLowerCase() };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function toSafeNotificationText(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

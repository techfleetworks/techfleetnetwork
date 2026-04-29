import { jsonResponse } from "../_shared/http.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SendAnnouncementEmailRequest {
  announcement_id: string;
}

export function parseSendAnnouncementEmailRequest(body: unknown): SendAnnouncementEmailRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const announcementId = (body as Record<string, unknown>).announcement_id;
  if (typeof announcementId !== "string" || !UUID_PATTERN.test(announcementId.trim())) {
    return jsonResponse({ error: "Invalid announcement_id" }, 400);
  }

  return { announcement_id: announcementId.trim() };
}

export function toPlainAnnouncementText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

import { scrub } from "../_shared/dlp.ts";
import { jsonResponse } from "../_shared/http.ts";

const QUERY_MAX_CHARS = 500;
const RESPONSE_MAX_CHARS = 32_768;
const QUERY_PATTERN = /^[\p{L}\p{N}\s.,!?;:'"()\[\]{}\-_/@#&+%$]{1,500}$/u;

export interface ExplorationCachePayload {
  query_normalized: string;
  response_markdown: string;
}

export function parseExplorationCachePayload(body: unknown): ExplorationCachePayload | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "Request body must be a JSON object" }, 400);
  }

  const record = body as Record<string, unknown>;
  const queryNormalized = typeof record.query_normalized === "string" ? record.query_normalized.trim() : "";
  const responseMarkdown = typeof record.response_markdown === "string" ? record.response_markdown.trim() : "";

  if (!queryNormalized || !responseMarkdown) {
    return jsonResponse({ error: "query_normalized and response_markdown are required" }, 400);
  }
  if (queryNormalized.length > QUERY_MAX_CHARS || !QUERY_PATTERN.test(queryNormalized)) {
    return jsonResponse({ error: "query_normalized contains unsupported characters" }, 400);
  }
  if (responseMarkdown.length > RESPONSE_MAX_CHARS) {
    return jsonResponse({ error: "response_markdown is too large" }, 413);
  }

  return {
    query_normalized: queryNormalized,
    response_markdown: scrub(responseMarkdown),
  };
}
import { jsonResponse } from "../_shared/http.ts";

const MAX_QUERY_LENGTH = 500;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const SAFE_RESULT_PROTOCOLS = new Set(["https:", "http:"]);

export interface FirecrawlSearchRequest {
  query: string;
  limit: number;
}

export interface FirecrawlSearchResult {
  title: string;
  description: string;
  url: string;
}

export function parseFirecrawlSearchRequest(body: unknown): FirecrawlSearchRequest | Response {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ success: false, error: "Request body must be a JSON object" }, 400);
  }

  const record = body as Record<string, unknown>;
  if (typeof record.query !== "string") {
    return jsonResponse({ success: false, error: "Query is required (min 2 chars)" }, 400);
  }

  const query = cleanText(record.query, MAX_QUERY_LENGTH);
  if (query.length < 2) {
    return jsonResponse({ success: false, error: "Query is required (min 2 chars)" }, 400);
  }

  const limitNumber = typeof record.limit === "number" || typeof record.limit === "string"
    ? Number(record.limit)
    : 3;
  const limit = Number.isFinite(limitNumber) ? Math.min(Math.max(Math.trunc(limitNumber), 1), 5) : 3;

  return { query, limit };
}

export function normalizeFirecrawlResults(data: unknown, limit: number): FirecrawlSearchResult[] {
  const rawResults = data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).data)
    ? (data as { data: unknown[] }).data
    : [];

  return rawResults.slice(0, limit).map((raw) => {
    const record = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      title: cleanText(record.title, 200) || "Untitled",
      description: cleanText(record.description, 500),
      url: cleanUrl(record.url),
    };
  });
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().slice(0, 2000);
  try {
    const url = new URL(trimmed);
    return SAFE_RESULT_PROTOCOLS.has(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

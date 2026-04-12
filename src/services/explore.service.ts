/**
 * Explore Service — enterprise-grade orchestration layer for the Explore feature.
 *
 * Responsibilities:
 * - Input validation & sanitization (OWASP A3/A7)
 * - Circuit-breaker protected AI & web search calls
 * - Cache-first strategy with normalized query keys
 * - Rate limiting via server-side check
 * - SSE stream parsing with abort support
 * - Structured logging & error reporting
 *
 * All state management stays in the React component; this service
 * handles pure data operations and side effects.
 */

import { supabase } from "@/integrations/supabase/client";
import { createLogger } from "@/services/logger.service";
import { edgeFunctionBreaker } from "@/lib/circuit-breaker";
import { normalizeQueryKey } from "@/lib/normalize-query";
import { sanitizeText, isSafeUrl } from "@/lib/security";
import type { WebSearchResult } from "@/components/resources/ExploreResultsSection";

const log = createLogger("ExploreService");

// ─── Constants ──────────────────────────────────────────────────────

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/techfleet-chat`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Max query length (bytes) to prevent oversized payloads */
const MAX_QUERY_BYTES = 1000;
/** Min query length after trim */
const MIN_QUERY_LENGTH = 2;
/** Max popular queries to fetch from DB */
const POPULAR_QUERY_LIMIT = 500;
/** Max web search results */
const WEB_SEARCH_LIMIT = 3;
/** Cache TTL in days — entries older than this are considered stale */
export const CACHE_TTL_DAYS = 7;

const EXPLORE_SYSTEM_PROMPT = `The user is exploring Tech Fleet resources. Based on what they want to accomplish, recommend specific handbooks, workshops, courses, and resources from the Tech Fleet knowledge base.

IMPORTANT: Structure your response EXACTLY as a list of recommendations. For EACH recommendation use this format:

### [Resource Name]
**Type:** One of: Course, User Guide, Template, Project, Web
**Description:** A short summary of what this resource covers.
**🌟 Why We Recommend:** In 1-2 simple sentences written at a 6th grade reading level, explain why this resource will help the user based on what they typed. Use everyday language a 12-year-old would understand. Connect it directly to what the user said they want to do.
**Link:** The direct URL to the resource if known. Use the techfleet.org domain when available.

CRITICAL — How to assign the Type:
- "Course" — only for items from the Courses page of Tech Fleet Network, or Masterclass Openings / Current Classes on techfleet.org.
- "User Guide" — any section of the User Guide at guide.techfleet.org (handbooks, policies, processes, etc.).
- "Template" — workshop templates listed under Workshop Templates.
- "Project" — projects listed under Project Openings.
- "Web" — any external online resource not hosted by Tech Fleet.

Provide 3-6 specific, actionable recommendations. Focus on resources that directly help the user accomplish their goal. Always prioritize the most relevant resources first.`;

// ─── Types ──────────────────────────────────────────────────────────

export interface PopularQuery {
  query_text: string;
  count: number;
}

export interface ExploreResult {
  markdown: string;
  fromCache: boolean;
}

export interface PopularQueryData {
  top5: PopularQuery[];
  all: PopularQuery[];
  recents: string[];
}

// ─── Validation ─────────────────────────────────────────────────────

export function validateQuery(raw: string): { valid: boolean; sanitized: string; error?: string } {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { valid: false, sanitized: "", error: "Query must be at least 2 characters." };
  }

  // Enforce byte limit
  const encoder = new TextEncoder();
  const bytes = encoder.encode(trimmed);
  if (bytes.length > MAX_QUERY_BYTES) {
    return { valid: false, sanitized: "", error: "Query is too long. Please shorten it." };
  }

  // Sanitize for XSS
  const sanitized = sanitizeText(trimmed);
  return { valid: true, sanitized };
}

// ─── Popular & Recent Queries ───────────────────────────────────────

export async function loadPopularAndRecent(): Promise<PopularQueryData> {
  return log.track("loadPopularAndRecent", "Loading popular and recent queries", undefined, async () => {
    const { data, error } = await supabase
      .from("exploration_queries")
      .select("query_text, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(POPULAR_QUERY_LIMIT);

    if (error) {
      log.warn("loadPopularAndRecent", `Query failed: ${error.message}`, {}, error);
      return { top5: [], all: [], recents: [] };
    }

    if (!data || data.length === 0) {
      return { top5: [], all: [], recents: [] };
    }

    // Count total explorations per normalized query (fuzzy grouping)
    // so repeated clicks and similar searches both increase the tally.
    const queryCounts = new Map<string, { count: number; displayText: string }>();
    for (const row of data) {
      const key = normalizeQueryKey(row.query_text);
      if (!key) continue;
      if (!queryCounts.has(key)) {
        queryCounts.set(key, { count: 0, displayText: row.query_text.trim() });
      }
      queryCounts.get(key)!.count += 1;
    }

    const sorted = Array.from(queryCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .map(([, entry]) => ({ query_text: entry.displayText, count: entry.count }));

    // Deduplicated recent queries
    const seenKeys = new Set<string>();
    const recents: string[] = [];
    for (const row of data) {
      const key = normalizeQueryKey(row.query_text);
      if (key && !seenKeys.has(key) && recents.length < 5) {
        seenKeys.add(key);
        recents.push(row.query_text.trim());
      }
    }

    return {
      top5: sorted.slice(0, 5),
      all: sorted,
      recents,
    };
  });
}

// ─── Query Persistence ──────────────────────────────────────────────

export async function persistQuery(userId: string, queryText: string): Promise<void> {
  try {
    await supabase.from("exploration_queries").insert({
      user_id: userId,
      query_text: queryText,
    });
  } catch (err) {
    log.warn("persistQuery", "Failed to persist query (non-blocking)", {}, err);
  }
}

// ─── Cache ──────────────────────────────────────────────────────────

export async function checkCache(normalizedKey: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("exploration_cache")
      .select("id, response_markdown")
      .eq("query_normalized", normalizedKey)
      .maybeSingle();

    if (data?.response_markdown) {
      log.info("checkCache", "Cache hit", { normalizedKey });
      return data.response_markdown;
    }
    log.debug("checkCache", "Cache miss", { normalizedKey });
    return null;
  } catch (err) {
    log.warn("checkCache", "Cache lookup failed — proceeding without cache", {}, err);
    return null;
  }
}

/**
 * Write to exploration cache via edge function (service_role only).
 * Client-side writes are blocked by RLS for security (cache-poisoning prevention).
 */
export async function writeCache(normalizedKey: string, markdown: string): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("write-exploration-cache", {
      body: { query_normalized: normalizedKey, response_markdown: markdown },
    });
    if (error) throw error;
    log.debug("writeCache", "Cache written via edge function", { normalizedKey });
  } catch (err) {
    log.warn("writeCache", "Failed to write cache (non-blocking)", {}, err);
  }
}

// ─── Web Search (Firecrawl) ─────────────────────────────────────────

export async function fetchWebResults(query: string): Promise<WebSearchResult[]> {
  try {
    const { data } = await edgeFunctionBreaker.executeWithFallback(
      () => supabase.functions.invoke("firecrawl-search", {
        body: { query, limit: WEB_SEARCH_LIMIT },
      }),
      { data: { success: false, results: [] }, error: null },
    );

    if (data?.success && Array.isArray(data.results)) {
      // Validate URLs in results
      return data.results
        .filter((r: WebSearchResult) => !r.url || isSafeUrl(r.url))
        .slice(0, WEB_SEARCH_LIMIT)
        .map((r: WebSearchResult) => ({
          title: sanitizeText(r.title || "Untitled"),
          description: sanitizeText(r.description || ""),
          url: r.url || "",
        }));
    }
    return [];
  } catch (err) {
    log.warn("fetchWebResults", "Web search failed (non-critical)", {}, err);
    return [];
  }
}

// ─── AI Stream ──────────────────────────────────────────────────────

/**
 * Parse SSE lines from the AI response stream.
 * Returns extracted content tokens. Handles partial lines
 * by returning them in `remaining`.
 */
function parseSSEBuffer(buffer: string): { tokens: string[]; remaining: string } {
  const tokens: string[] = [];
  let remaining = buffer;
  let newlineIndex: number;

  while ((newlineIndex = remaining.indexOf("\n")) !== -1) {
    let line = remaining.slice(0, newlineIndex);
    remaining = remaining.slice(newlineIndex + 1);

    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line.startsWith(":") || line.trim() === "") continue;
    if (!line.startsWith("data: ")) continue;

    const jsonStr = line.slice(6).trim();
    if (jsonStr === "[DONE]") {
      remaining = "";
      break;
    }

    try {
      const parsed = JSON.parse(jsonStr);
      const content = parsed.choices?.[0]?.delta?.content as string | undefined;
      if (content) tokens.push(content);
    } catch {
      // Incomplete JSON — put back into remaining and break
      remaining = line + "\n" + remaining;
      break;
    }
  }

  return { tokens, remaining };
}

export interface StreamOptions {
  query: string;
  onChunk: (fullText: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream AI recommendations via SSE. Protected by circuit breaker.
 * Returns the complete response text.
 */
export async function streamRecommendations({ query, onChunk, signal }: StreamOptions): Promise<string> {
  return edgeFunctionBreaker.execute(async () => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: EXPLORE_SYSTEM_PROMPT },
          {
            role: "user",
            content: `I want to: ${query}\n\nPlease recommend the most relevant Tech Fleet resources, handbooks, workshops, and courses that will help me accomplish this.`,
          },
        ],
      }),
      signal,
    });

    if (!resp.ok) {
      const status = resp.status;
      // Consume body to avoid resource leak
      await resp.text().catch(() => {});

      if (status === 429) throw new ExploreError("Too many requests. Please wait a moment.", "rate_limited");
      if (status === 402) throw new ExploreError("AI usage limit reached. Please try again later.", "quota_exceeded");
      throw new ExploreError(`AI service returned status ${status}`, "api_error");
    }

    if (!resp.body) throw new ExploreError("No response body from AI", "empty_response");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const { tokens, remaining } = parseSSEBuffer(buffer);
        buffer = remaining;

        for (const token of tokens) {
          fullText += token;
        }
        if (tokens.length > 0) {
          onChunk(fullText);
        }
      }

      // Final flush
      if (buffer.trim()) {
        const { tokens } = parseSSEBuffer(buffer + "\n");
        for (const token of tokens) {
          fullText += token;
        }
        if (tokens.length > 0) {
          onChunk(fullText);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText;
  });
}

// ─── Custom Error ───────────────────────────────────────────────────

export type ExploreErrorCode = "rate_limited" | "quota_exceeded" | "api_error" | "empty_response" | "validation" | "circuit_open";

export class ExploreError extends Error {
  code: ExploreErrorCode;
  constructor(message: string, code: ExploreErrorCode) {
    super(message);
    this.name = "ExploreError";
    this.code = code;
  }
}

// ─── Orchestrator ───────────────────────────────────────────────────

export interface ExploreOptions {
  query: string;
  userId?: string;
  onChunk: (fullText: string) => void;
  onWebResults: (results: WebSearchResult[]) => void;
  signal?: AbortSignal;
}

/**
 * Full explore orchestration:
 * 1. Validate & sanitize query
 * 2. Persist query (non-blocking)
 * 3. Check cache → return if hit
 * 4. Fire web search in parallel (non-blocking)
 * 5. Stream AI response
 * 6. Cache result (non-blocking)
 */
export async function explore(options: ExploreOptions): Promise<ExploreResult> {
  const { query, userId, onChunk, onWebResults, signal } = options;

  // 1. Validate
  const validation = validateQuery(query);
  if (!validation.valid) {
    throw new ExploreError(validation.error || "Invalid query", "validation");
  }
  const sanitizedQuery = validation.sanitized;
  const normalizedKey = normalizeQueryKey(sanitizedQuery) || sanitizedQuery.toLowerCase();

  // 2. Persist query (fire-and-forget)
  if (userId) {
    persistQuery(userId, sanitizedQuery).catch(() => {});
  }

  // 3. Check cache
  const cached = await checkCache(normalizedKey);
  if (cached) {
    onChunk(cached);
    // Still fire web search for supplemental results
    fetchWebResults(sanitizedQuery).then(onWebResults).catch(() => {});
    return { markdown: cached, fromCache: true };
  }

  // 4. Fire web search in parallel
  fetchWebResults(sanitizedQuery).then(onWebResults).catch(() => {});

  // 5. Stream AI response
  const markdown = await streamRecommendations({
    query: sanitizedQuery,
    onChunk,
    signal,
  });

  // 6. Cache result (fire-and-forget)
  if (markdown.trim()) {
    writeCache(normalizedKey, markdown).catch(() => {});
  }

  return { markdown, fromCache: false };
}

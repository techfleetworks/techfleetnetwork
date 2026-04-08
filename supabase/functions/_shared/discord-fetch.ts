/**
 * Resilient Discord API fetch wrapper with exponential backoff retry.
 *
 * Handles:
 * - Rate limits (429) with Retry-After header respect
 * - Transient server errors (500, 502, 503, 504)
 * - Network failures (fetch throws)
 *
 * Non-retryable status codes (4xx except 429) fail immediately.
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 15_000;

export interface DiscordFetchOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
}

export interface DiscordFetchResult {
  response: Response;
  /** Number of retries that were performed (0 = succeeded first try) */
  retries: number;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function getRetryDelay(attempt: number, baseDelay: number, retryAfterHeader?: string | null): number {
  // Discord rate limit: respect Retry-After header (in seconds)
  if (retryAfterHeader) {
    const retryAfterSec = parseFloat(retryAfterHeader);
    if (!isNaN(retryAfterSec) && retryAfterSec > 0) {
      return Math.min(retryAfterSec * 1000 + 100, MAX_RETRY_DELAY_MS);
    }
  }
  // Exponential backoff with jitter
  const delay = baseDelay * 2 ** attempt;
  const jitter = Math.random() * baseDelay * 0.5;
  return Math.min(delay + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Fetch from Discord API with automatic retry on transient failures.
 *
 * @example
 * ```ts
 * const { response } = await discordFetch(
 *   `https://discord.com/api/v10/guilds/${guildId}/roles`,
 *   { headers: { Authorization: `Bot ${token}` } }
 * );
 * ```
 */
export async function discordFetch(
  url: string,
  options: DiscordFetchOptions = {},
): Promise<DiscordFetchResult> {
  const { maxRetries = DEFAULT_MAX_RETRIES, baseDelayMs = DEFAULT_BASE_DELAY_MS, ...fetchOptions } = options;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions);

      // Success or non-retryable client error → return immediately
      if (response.ok || !isRetryableStatus(response.status)) {
        return { response, retries: attempt };
      }

      // Retryable failure — save response for potential final return
      lastResponse = response;

      if (attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After") ?? response.headers.get("retry-after");
        const delay = getRetryDelay(attempt, baseDelayMs, retryAfter);

        // Consume body to free resources before retrying
        await response.text().catch(() => {});
        await new Promise((r) => setTimeout(r, delay));
      }
    } catch (err) {
      // Network error — retry
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt, baseDelayMs);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  if (lastResponse) {
    return { response: lastResponse, retries: maxRetries };
  }

  // Only network errors occurred — throw the last one
  throw lastError ?? new Error("Discord API request failed after retries");
}

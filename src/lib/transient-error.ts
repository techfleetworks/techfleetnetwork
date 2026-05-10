/**
 * Shared classifier for distinguishing transient (network/infra) failures
 * from structural (auth/RLS/schema/code) failures.
 *
 * Used by polling services (announcements, notifications, network activity)
 * so they can degrade gracefully on transient blips without flooding the
 * admin triage queue.
 */

export interface ClassifiableError {
  message?: string;
  code?: string | number;
  status?: number;
  name?: string;
}

const TRANSIENT_MESSAGE_PATTERNS: readonly RegExp[] = [
  /Failed to fetch/i,
  /NetworkError/i,
  /Network request failed/i,
  /Load failed/i,
  /\bECONNRESET\b/i,
  /\bETIMEDOUT\b/i,
  /\bENOTFOUND\b/i,
  /timeout/i,
  /aborted/i,
  /AbortError/i,
  /signal is aborted/i,
  /FunctionsFetchError/i,
  /503\b/,
  /502\b/,
  /504\b/,
  /Service Unavailable/i,
  /Bad Gateway/i,
  /Gateway Timeout/i,
];

// PostgREST / Postgres codes that are transient infra
const TRANSIENT_PG_CODES = new Set<string>([
  "PGRST000", // generic connection
  "PGRST001",
  "PGRST002",
  "57P01", // admin shutdown
  "57P02", // crash shutdown
  "57P03", // cannot connect now
  "08000", // connection exception
  "08003",
  "08006",
  "08001",
  "08004",
  "53300", // too many connections
  "53400",
  "55P03", // lock not available
  "40001", // serialization
  "40P01", // deadlock
]);

const TRANSIENT_HTTP_STATUSES = new Set<number>([0, 408, 425, 429, 500, 502, 503, 504]);

export function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const e = err as ClassifiableError;
  const msg = typeof e.message === "string" ? e.message : "";
  const code = e.code != null ? String(e.code) : "";
  const status = typeof e.status === "number" ? e.status : undefined;

  if (e.name === "AbortError") return true;
  if (status !== undefined && TRANSIENT_HTTP_STATUSES.has(status)) return true;
  if (code && TRANSIENT_PG_CODES.has(code)) return true;
  for (const re of TRANSIENT_MESSAGE_PATTERNS) {
    if (re.test(msg)) return true;
  }
  return false;
}

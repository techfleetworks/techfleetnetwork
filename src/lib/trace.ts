/**
 * Trace correlation IDs.
 *
 * A trace id ties together every audit_log row that belongs to a single
 * user-initiated operation:
 *   1. Frontend: emitted on the row written by reportError (changed_fields: trace:<id>)
 *   2. Edge: forwarded via `x-trace-id` request header so the function emits
 *      its own audit rows under the same id.
 *   3. DB: optionally captured as `app.trace_id` GUC so triggers inherit it.
 *
 * This lets admins join the entire chain in /admin/activity-log by trace id.
 */
const TRACE_ID_KEY = "__lovable_trace_id__";

/** Generate a short, URL-safe trace id (12 hex chars of entropy). */
export function newTraceId(): string {
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Run `fn` with a fresh trace id available via getCurrentTraceId(). */
export function withTrace<T>(fn: (traceId: string) => T): T {
  const id = newTraceId();
  const prev = (globalThis as Record<string, unknown>)[TRACE_ID_KEY];
  (globalThis as Record<string, unknown>)[TRACE_ID_KEY] = id;
  try {
    return fn(id);
  } finally {
    (globalThis as Record<string, unknown>)[TRACE_ID_KEY] = prev;
  }
}

/** Read the current ambient trace id, if any. */
export function getCurrentTraceId(): string | undefined {
  const v = (globalThis as Record<string, unknown>)[TRACE_ID_KEY];
  return typeof v === "string" ? v : undefined;
}

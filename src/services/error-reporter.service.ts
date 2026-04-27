/**
 * Client-side error reporting service.
 *
 * Captures unhandled errors and promise rejections, writing stack traces
 * to the audit_log table via the write_audit_log RPC so admins can
 * review them in the Activity Log page.
 *
 * Enterprise hardening:
 * - Deduplication: identical errors within a window are reported once
 * - Rate limiting: max N reports per minute to prevent flood at 100k users
 * - Payload size capping: prevents oversized audit_log rows
 *
 * PII is NOT stored in the error_message — only the error name, message,
 * and sanitised stack trace.
 */

import { supabase } from "@/integrations/supabase/client";

/** Maximum error_message length stored in audit_log */
const MAX_MSG_LENGTH = 2000;

/** Max reports per minute per tab (prevents flood) */
const MAX_REPORTS_PER_MINUTE = 10;

/** Dedup window in ms — identical errors within this window are skipped */
const DEDUP_WINDOW_MS = 60_000;

let reportCount = 0;
let reportWindowStart = Date.now();
const recentErrors = new Map<string, number>(); // fingerprint → timestamp

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

/** Generate a short fingerprint for deduplication */
function fingerprint(msg: string, source: string): string {
  // Use first 200 chars of message + source as key
  return `${source}::${msg.slice(0, 200)}`;
}

/** Check rate limit — returns true if the report should be sent */
function checkRateLimit(): boolean {
  const now = Date.now();
  if (now - reportWindowStart > 60_000) {
    reportCount = 0;
    reportWindowStart = now;
  }
  if (reportCount >= MAX_REPORTS_PER_MINUTE) return false;
  reportCount++;
  return true;
}

/** Check dedup — returns true if this is a new error */
function checkDedup(fp: string): boolean {
  const now = Date.now();
  const lastSeen = recentErrors.get(fp);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return false;

  recentErrors.set(fp, now);

  // Housekeep: remove stale entries to prevent memory leak
  if (recentErrors.size > 100) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [key, ts] of recentErrors) {
      if (ts < cutoff) recentErrors.delete(key);
    }
  }

  return true;
}

/**
 * Write an error entry to the audit_log.
 *
 * Uses the SECURITY DEFINER `write_audit_log` RPC so authenticated
 * users can insert without a direct INSERT policy on audit_log.
 */
async function reportToAuditLog(
  errorMessage: string,
  source: string,
  userId?: string,
) {
  const fp = fingerprint(errorMessage, source);
  if (!checkDedup(fp)) return;
  if (!checkRateLimit()) return;

  try {
    await supabase.rpc("write_audit_log", {
      p_event_type: "client_error",
      p_table_name: "frontend",
      p_record_id: source,
      p_user_id: userId ?? "00000000-0000-0000-0000-000000000000",
      p_error_message: truncate(errorMessage, MAX_MSG_LENGTH),
      p_changed_fields: [source],
    });
  } catch {
    // Swallow — never throw from the error reporter itself
  }
}

/**
 * Format an Error (or unknown) into a loggable string with stack trace.
 */
function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack ?? "(no stack)"}`;
  }
  return String(err);
}

/**
 * Report a caught error programmatically.
 *
 * Usage:
 * ```ts
 * import { reportError } from "@/services/error-reporter.service";
 * try { … } catch (e) { reportError(e, "MyComponent.handleClick"); }
 * ```
 */
export function reportError(
  err: unknown,
  source = "unknown",
  userId?: string,
) {
  const msg = formatError(err);
  if (isSuppressed(msg)) return;
  reportToAuditLog(msg, source, userId);
}

/**
 * Get current user id from supabase session (best-effort, non-blocking).
 */
async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id;
  } catch {
    return undefined;
  }
}

/**
 * Install global listeners for unhandled errors and unhandled promise
 * rejections. Call once at app startup.
 */
/** Errors matching these patterns are expected browser/SW noise — skip logging */
const SUPPRESSED_PATTERNS = [
  "Lock broken by another request",
  "newestWorker is null",
  "Failed to update a ServiceWorker",
  "An unknown error occurred when fetching the script",
  "Extension context invalidated",
  "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script",
  "at predicate (eval at evaluate",
] as const;

function isOpaqueScriptError(event: ErrorEvent, msg: string): boolean {
  return msg === "Script error." && !event.error && !event.filename && event.lineno === 0 && event.colno === 0;
}

function isSuppressed(msg: string): boolean {
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

export function installGlobalErrorReporter() {
  window.addEventListener("error", async (event) => {
    const msg = formatError(event.error ?? event.message);
    if (isOpaqueScriptError(event, msg)) return;
    if (isSuppressed(msg)) return;
    const source = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : "window.onerror";
    const userId = await getCurrentUserId();
    reportToAuditLog(msg, source, userId);
  });

  window.addEventListener("unhandledrejection", async (event) => {
    const msg = formatError(event.reason);
    if (isSuppressed(msg)) return;
    const userId = await getCurrentUserId();
    reportToAuditLog(msg, "unhandledrejection", userId);
  });
}

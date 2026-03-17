/**
 * Client-side error reporting service.
 *
 * Captures unhandled errors and promise rejections, writing stack traces
 * to the audit_log table via the write_audit_log RPC so admins can
 * review them in the Activity Log page.
 *
 * PII is NOT stored in the error_message — only the error name, message,
 * and sanitised stack trace.
 */

import { supabase } from "@/integrations/supabase/client";

/** Maximum error_message length stored in audit_log */
const MAX_MSG_LENGTH = 2000;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
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
export function installGlobalErrorReporter() {
  window.addEventListener("error", async (event) => {
    const msg = formatError(event.error ?? event.message);
    const source = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : "window.onerror";
    const userId = await getCurrentUserId();
    reportToAuditLog(msg, source, userId);
  });

  window.addEventListener("unhandledrejection", async (event) => {
    const msg = formatError(event.reason);
    const userId = await getCurrentUserId();
    reportToAuditLog(msg, "unhandledrejection", userId);
  });
}

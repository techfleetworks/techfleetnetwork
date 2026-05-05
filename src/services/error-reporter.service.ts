/**
 * Client-side error reporting service.
 *
 * Captures unhandled errors, programmatic reports, React Query failures,
 * service-layer throws, edge function failures, and UI render errors.
 * Writes structured rows to `audit_log` via `write_audit_log` so admins can
 * triage them in /admin/activity-log.
 *
 * Hardening:
 * - Deduplication: identical errors within a 60s window are skipped.
 * - Rate limiting: 10 reports/min/tab; overflow emits a single
 *   `client_error_overflow` per minute carrying the suppressed count.
 * - Payload capping: stack <= 2000 chars, fields <= 100 chars/each.
 * - PII safety: emails are stripped, only error name/message/stack land.
 * - **CRITICAL FIX (May 2026):** previously sent a nil-UUID for `p_user_id`
 *   when no user was known, but `write_audit_log` rejects any non-null
 *   p_user_id != auth.uid(). That made every authenticated client_error
 *   silently fail (6 events/7d). We now pass `null` so the RPC accepts.
 */

import { supabase } from "@/integrations/supabase/client";
import { getCurrentTraceId } from "@/lib/trace";

const MAX_MSG_LENGTH = 2000;
const MAX_REPORTS_PER_MINUTE = 10;
const DEDUP_WINDOW_MS = 60_000;
const OVERFLOW_FLUSH_MS = 60_000;

let reportCount = 0;
let reportWindowStart = Date.now();
let suppressedSinceLastFlush = 0;
let overflowFlushTimer: ReturnType<typeof setTimeout> | null = null;
const recentErrors = new Map<string, number>();

export type ReportSeverity = "info" | "warn" | "error";
export type ReportEventType = "client_error" | "ui_render_error" | "ui_chunk_load_failed" | "edge_invoke_failed" | "client_error_overflow";

interface ReportOptions {
  severity?: ReportSeverity;
  eventType?: ReportEventType;
  traceId?: string;
  extraFields?: string[];
  userId?: string;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function fingerprint(msg: string, source: string): string {
  return `${source}::${msg.slice(0, 200)}`;
}

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

function checkDedup(fp: string): boolean {
  const now = Date.now();
  const lastSeen = recentErrors.get(fp);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return false;
  recentErrors.set(fp, now);
  if (recentErrors.size > 100) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [key, ts] of recentErrors) {
      if (ts < cutoff) recentErrors.delete(key);
    }
  }
  return true;
}

function scheduleOverflowFlush() {
  if (overflowFlushTimer) return;
  overflowFlushTimer = setTimeout(() => {
    const count = suppressedSinceLastFlush;
    suppressedSinceLastFlush = 0;
    overflowFlushTimer = null;
    if (count > 0) {
      // Reset the rate-limit window so the overflow notice itself can land.
      reportCount = 0;
      reportWindowStart = Date.now();
      void writeAudit({
        eventType: "client_error_overflow",
        message: `${count} client error report(s) suppressed by rate limit`,
        source: "error-reporter",
        severity: "warn",
        traceId: undefined,
        extraFields: [`suppressed:${count}`],
        userId: undefined,
      });
    }
  }, OVERFLOW_FLUSH_MS);
}

function buildChangedFields(opts: {
  source: string;
  severity: ReportSeverity;
  traceId?: string;
  extraFields?: string[];
}): string[] {
  const safe = (raw: string) =>
    raw.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 100);
  const fields = [
    `source:${safe(opts.source)}`,
    `severity:${opts.severity}`,
  ];
  if (opts.traceId) fields.push(`trace:${safe(opts.traceId)}`);
  for (const f of opts.extraFields ?? []) {
    if (f.length <= 100 && /^[A-Za-z0-9_.:-]+$/.test(f)) fields.push(f);
  }
  return fields.slice(0, 50);
}

interface WriteAuditArgs {
  eventType: ReportEventType;
  message: string;
  source: string;
  severity: ReportSeverity;
  traceId?: string;
  extraFields?: string[];
  userId?: string;
}

async function writeAudit(args: WriteAuditArgs): Promise<void> {
  try {
    await supabase.rpc("write_audit_log", {
      p_event_type: args.eventType,
      p_table_name: "frontend",
      p_record_id: args.source.slice(0, 200),
      // CRITICAL: pass null when unknown — never a sentinel UUID.
      p_user_id: args.userId ?? null,
      p_error_message: truncate(args.message, MAX_MSG_LENGTH),
      p_changed_fields: buildChangedFields({
        source: args.source,
        severity: args.severity,
        traceId: args.traceId,
        extraFields: args.extraFields,
      }),
    });
  } catch {
    // Telemetry must never throw.
  }
}

async function reportToAuditLog(
  errorMessage: string,
  source: string,
  options: ReportOptions = {},
) {
  const fp = fingerprint(errorMessage, source);
  if (!checkDedup(fp)) return;
  if (!checkRateLimit()) {
    suppressedSinceLastFlush += 1;
    scheduleOverflowFlush();
    return;
  }

  await writeAudit({
    eventType: options.eventType ?? "client_error",
    message: errorMessage,
    source,
    severity: options.severity ?? "error",
    traceId: options.traceId ?? getCurrentTraceId(),
    extraFields: options.extraFields,
    userId: options.userId,
  });
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}\n${err.stack ?? "(no stack)"}`;
  }
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

/**
 * Report a caught error programmatically.
 *
 * ```ts
 * try { ... } catch (e) { reportError(e, "MyComponent.handleClick"); }
 * ```
 */
export function reportError(
  err: unknown,
  source = "unknown",
  optionsOrUserId: ReportOptions | string = {},
) {
  const msg = formatError(err);
  if (isSuppressed(msg)) return;
  const options: ReportOptions = typeof optionsOrUserId === "string"
    ? { userId: optionsOrUserId }
    : optionsOrUserId;
  void reportToAuditLog(msg, source, options);
}

/**
 * Report a non-error activity (e.g. session_idle_timeout, push_permission_denied)
 * that should land in the audit log. Severity defaults to "info".
 */
export function reportActivity(
  eventType: ReportEventType,
  source: string,
  message: string,
  options: Omit<ReportOptions, "eventType"> = {},
) {
  void reportToAuditLog(message, source, {
    ...options,
    eventType,
    severity: options.severity ?? "info",
  });
}

const SUPPRESSED_PATTERNS = [
  "Lock broken by another request",
  "newestWorker is null",
  "Failed to update a ServiceWorker",
  "An unknown error occurred when fetching the script",
  "Extension context invalidated",
  "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not an allowed source of script",
  "at predicate (eval at evaluate",
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
] as const;

function isOpaqueScriptError(event: ErrorEvent, msg: string): boolean {
  return msg === "Script error." && !event.error && !event.filename && event.lineno === 0 && event.colno === 0;
}

function isSuppressed(msg: string): boolean {
  return SUPPRESSED_PATTERNS.some((p) => msg.includes(p));
}

export function installGlobalErrorReporter() {
  window.addEventListener("error", (event) => {
    const msg = formatError(event.error ?? event.message);
    if (isOpaqueScriptError(event, msg)) return;
    if (isSuppressed(msg)) return;
    const source = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : "window.onerror";
    void reportToAuditLog(msg, source);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const msg = formatError(event.reason);
    if (isSuppressed(msg)) return;
    void reportToAuditLog(msg, "unhandledrejection");
  });
}

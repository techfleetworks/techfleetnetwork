/**
 * Single public entry-point for client-side error reporting.
 *
 * Phase-2 triage refactor (May 2026): every caller in app/service code MUST
 * import { report } from here instead of touching error-reporter.service
 * directly. The ESLint rule `no-direct-error-reporter` enforces this so we
 * have ONE place to gate reports through the structural classifier.
 *
 * Pipeline:
 *   caller → report() → classify() drop?  → return silently
 *                     → classify() report? → reportError() → audit_log
 *
 * No string-match suppression. The classifier is structural (extension
 * frames, navigator.onLine, document.visibilityState, AbortError).
 */
import {
  reportError as internalReportError,
  reportActivity as internalReportActivity,
  reportRecovery as internalReportRecovery,
  reportValidationRejection as internalReportValidationRejection,
  recordClassifiedDrop,
  type ReportSeverity,
  type ReportEventType,
} from "@/services/error-reporter.service";
import { classify } from "./classify";
import { toError } from "@/lib/errors/toError";

export type { ReportSeverity, ReportEventType };

export interface ReportContext {
  source: string;
  eventType?: ReportEventType;
  severity?: ReportSeverity;
  traceId?: string;
  extra?: Record<string, unknown>;
}

/**
 * Report an error after structural classification.
 * Silent (no network call, no enqueue) for: extension-frame errors,
 * offline state, hidden-tab fetch failures, AbortError.
 */
export function report(error: unknown, ctx: ReportContext): void {
  const classified = classify(error);
  if (!classified.report) {
    // ADR-0031: a classified drop is NEVER a black hole. Feed it into the same
    // per-minute aggregate the reporter already uses for suppression/dedup,
    // keyed by (reason, source), so a spike in e.g. infra_transient for a given
    // source surfaces in System Health — with zero per-occurrence audit spam
    // (ADR-0021 preserved). The guard check-report-has-no-silent-drop enforces
    // that this branch records before it returns; do not replace this with a
    // bare `return`.
    recordClassifiedDrop(classified.reason ?? "unknown", ctx.source);
    // Optional dev breadcrumb so a developer can still see what was dropped.
    if (typeof window !== "undefined" && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[report:dropped]", classified.reason, ctx.source, error);
    }
    return;
  }
  const normalized = toError(error);
  internalReportError(normalized, ctx.source, {
    eventType: ctx.eventType,
    severity: ctx.severity,
    traceId: ctx.traceId,
  });
}

/** Non-error activity (info/audit) — passes straight through, no classifier. */
export const reportActivity = internalReportActivity;
/** Recovery signal (e.g. circuit breaker closed) — passes straight through. */
export const reportRecovery = internalReportRecovery;

/** Zod/validator rejection — passes straight through to the audit logger. */
export const reportValidationRejection = internalReportValidationRejection;

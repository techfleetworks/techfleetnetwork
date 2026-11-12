// Single owner of the "an announcement broadcast did not reach its audience" alert.
//
// WHY THIS EXISTS: send-announcement-email is invoked fire-and-forget from the UI
// (AnnouncementService.sendNotifications). So when the enqueue fails — e.g. the
// 2026-11-12 incident where enqueue_announcement_emails was cancelled by the 8s
// statement_timeout and rolled back to zero rows — the edge function returns 500
// but no human ever sees it: the browser swallows the non-2xx at warn and the admin
// has already navigated away. The broadcast is silently dead.
//
// This routes that failure to the durable paging sink the rest of the email
// pipeline already uses: an audit_log row via write_audit_log, which surfaces in
// System Health → Top Errors (same channel as email-pipeline-health). It is the
// server-side signal, so it fires regardless of what the client does.
//
// Scope (PR1 of docs/design/announcement-broadcast-resilience.md): this pages when
// the enqueue itself fails. The broader backstop — a periodic reconciliation that
// catches "the edge function never ran" or "enqueued < eligible after a partial
// drain" — is PR5 and reuses emitAnnouncementReachAlert here.

/** audit_log event_type for a failed announcement broadcast (regex: ^[a-z][a-z0-9_:-]{2,80}$). */
export const ANNOUNCEMENT_REACH_FAILED_EVENT = "email_announcement_reach_failed";

export type ReachAlertReason = "enqueue_failed" | "zero_reach";

export interface ReachAlertInput {
  announcementId: string;
  reason: ReachAlertReason;
  /** Human-readable detail, truncated to 1000 chars for p_error_message. */
  detail: string;
  eligible?: number;
  enqueued?: number;
}

/** The minimal surface we need from the service-role client — keeps this unit-testable. */
export interface AuditWriter {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
}

/**
 * Build the audit_log `changed_fields` tags for a reach alert. Pure, so the exact
 * fingerprint (which drives System Health de-noise) is pinned by a unit test.
 */
export function buildReachAlertTags(input: ReachAlertInput): string[] {
  const tags = [`reason:${input.reason}`];
  if (typeof input.eligible === "number") tags.push(`eligible:${input.eligible}`);
  if (typeof input.enqueued === "number") tags.push(`enqueued:${input.enqueued}`);
  return tags;
}

/**
 * Page on a failed announcement broadcast via the audit sink. Best-effort by
 * design: an alerting failure must never change the caller's response or mask the
 * original error, but it is surfaced to the console so it is not itself silent.
 */
export async function emitAnnouncementReachAlert(
  client: AuditWriter,
  input: ReachAlertInput,
): Promise<void> {
  try {
    const { error } = await client.rpc("write_audit_log", {
      p_event_type: ANNOUNCEMENT_REACH_FAILED_EVENT,
      // The record is the announcement, not an email_outbox row — on the failure
      // this alerts (an enqueue rollback) no email_outbox row exists, so pointing at
      // the announcements row is what an operator can actually click through to.
      p_table_name: "announcements",
      p_record_id: input.announcementId,
      // Service-role write: write_audit_log rejects a nil-UUID, so pass null.
      p_user_id: null,
      p_changed_fields: buildReachAlertTags(input),
      p_error_message: input.detail.slice(0, 1000),
    });
    if (error) {
      console.error("[announcement-reach] alert write failed", { error });
    }
  } catch (err) {
    console.error("[announcement-reach] alert threw", { err: String(err) });
  }
}

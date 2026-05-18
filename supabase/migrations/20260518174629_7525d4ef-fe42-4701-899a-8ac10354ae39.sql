-- Triage fix: prevent auth-email TTL expiry during provider rate-limit episodes.
-- The previous 15-minute TTL was shorter than typical retry-after windows, so
-- enqueued signup/recovery emails were DLQ'd before the dispatcher could send.
-- Bump to 60 minutes (matches transactional) — still well under any reasonable
-- OTP validity window.
UPDATE public.email_send_state
SET auth_email_ttl_minutes = 60,
    updated_at = now()
WHERE id = 1;

-- Resolve stale pipeline-health fix-queue items: the underlying state was a
-- one-time rate-limit backoff at ~13:30-14:00 UTC on 2026-05-18. All
-- pipelines are now healthy (0 stuck, latest probe). The TTL increase above
-- prevents recurrence.
UPDATE public.agent_fix_queue
SET status = 'resolved',
    resolved_at = now(),
    proposed_fix_summary = COALESCE(proposed_fix_summary, '') ||
      E'\nResolved 2026-05-18: root cause was provider rate-limit backoff combined with 15-min auth-email TTL. Bumped auth_email_ttl_minutes to 60. Current state: 0 stuck across all pipelines.',
    updated_at = now()
WHERE status = 'pending'
  AND event_type IN (
    'email_announcement_pipeline_unhealthy',
    'email_password_recovery_pipeline_unhealthy',
    'email_signup_confirmation_pipeline_unhealthy',
    'email_dlq'
  )
  AND last_seen_at < now() - interval '2 hours';
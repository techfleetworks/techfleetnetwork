UPDATE public.agent_fix_queue
SET status='resolved', resolved_at=now(), updated_at=now()
WHERE id IN (
  '10f3807b-7d76-40b1-abe9-4f9679d8052f',
  'a49aaa68-af2a-4193-b8b5-d0029c130987'
) AND status NOT IN ('resolved','dismissed');

SELECT public.write_audit_log(
  'fix_queue_status_changed'::text,
  'agent_fix_queue'::text,
  '10f3807b-7d76-40b1-abe9-4f9679d8052f'::text,
  NULL::uuid,
  ARRAY['status:pending->resolved','reason:root_cause_fixed']::text[],
  'Resolved: auth-email-hook now mints+upserts unsubscribe_token before enqueue; 0 failed signup sends in last 24h.'::text
);

SELECT public.write_audit_log(
  'fix_queue_status_changed'::text,
  'agent_fix_queue'::text,
  'a49aaa68-af2a-4193-b8b5-d0029c130987'::text,
  NULL::uuid,
  ARRAY['status:pending->resolved','reason:no_recurrence']::text[],
  'Resolved: single FunctionsHttpError 24h+ ago, no recurrence and no actionable context.'::text
);

INSERT INTO public.bdd_scenarios (feature_area, feature_area_number, scenario_id, title, gherkin)
VALUES
  ('Error Triage Queue', 1114, 'TRIAGE-FIX-004',
   'Resolve stale email pipeline fingerprint after root cause fix',
   $$Given the auth-email-hook mints an unsubscribe_token before enqueuing every transactional email
And email_send_log_latest_failed('signup', now()-'24h'::interval) returns zero rows
When an admin resolves the email_signup_confirmation_pipeline_unhealthy fingerprint
Then [DB] agent_fix_queue.status='resolved' for that row
And [DB] audit_log records a fix_queue_status_changed event with reason citing the root cause
And [UI] the System Health Triage tab no longer lists the entry under pending
And [Code] no further alerts are emitted by email-pipeline-health while failed_last_24h=0$$),
  ('Error Triage Queue', 1114, 'TRIAGE-FIX-005',
   'Resolve non-recurring generic edge function error',
   $$Given a single client_error fingerprint for FunctionsHttpError with one occurrence over 24h ago
And no further occurrences exist in audit_log over the last 7 days
When an admin resolves the fingerprint with a no-recurrence reason
Then [DB] agent_fix_queue.status='resolved' and resolved_at is set
And [DB] audit_log captures the status change with the reason
And [UI] the entry disappears from the Triage tab pending list
And [Code] upsert_fix_queue_entry will reopen the row only if the same fingerprint reoccurs$$)
ON CONFLICT (scenario_id) DO NOTHING;
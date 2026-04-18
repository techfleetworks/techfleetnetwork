CREATE OR REPLACE FUNCTION public.is_remediation_allowed(p_fn text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_fn = ANY (ARRAY[
    'cleanup_stuck_email_queue',
    'cleanup_rate_limits',
    'cleanup_passkey_login_artifacts',
    'drain_notification_outbox',
    'retry_stuck_fanout_jobs',
    'retry_pending_discord_role_grants',
    'evaluate_system_health'
  ]);
$$;
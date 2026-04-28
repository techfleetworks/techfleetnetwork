CREATE OR REPLACE FUNCTION public.is_remediation_allowed(p_fn text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_fn = ANY(ARRAY[
    'cleanup_stuck_email_queue',
    'cleanup_rate_limits',
    'cleanup_two_factor_login_artifacts',
    'drain_notification_outbox',
    'retry_stuck_fanout_jobs',
    'retry_pending_discord_role_grants',
    'evaluate_system_health'
  ]);
$function$;

REVOKE ALL ON FUNCTION public.is_remediation_allowed(text) FROM public;
GRANT EXECUTE ON FUNCTION public.is_remediation_allowed(text) TO service_role;

DROP FUNCTION IF EXISTS public.cleanup_passkey_login_artifacts();
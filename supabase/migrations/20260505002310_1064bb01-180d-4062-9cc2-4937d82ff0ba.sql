
-- Extend the email audit trigger to also fire when status transitions on UPDATE.
CREATE OR REPLACE FUNCTION public.audit_email_send_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  resolved_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.try_write_audit_log(
      CASE NEW.status
        WHEN 'pending' THEN 'email_queued'
        WHEN 'sent' THEN 'email_sent'
        WHEN 'failed' THEN 'email_failed'
        WHEN 'dlq' THEN 'email_dlq'
        WHEN 'rate_limited' THEN 'email_rate_limited'
        WHEN 'suppressed' THEN 'email_suppressed'
        WHEN 'bounced' THEN 'email_bounced'
        WHEN 'complained' THEN 'email_complained'
        ELSE 'email_' || NEW.status
      END,
      'email_send_log',
      COALESCE(NEW.message_id, NEW.id::text),
      auth.uid(),
      ARRAY[
        COALESCE(NEW.template_name, ''),
        COALESCE(NEW.recipient_email, ''),
        COALESCE(NEW.status, '')
      ],
      NEW.error_message
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('failed','dlq','bounced','complained') THEN
    resolved_event := CASE NEW.status
      WHEN 'failed' THEN 'email_failed'
      WHEN 'dlq' THEN 'email_dlq'
      WHEN 'bounced' THEN 'email_bounced'
      WHEN 'complained' THEN 'email_complained'
    END;
    PERFORM public.try_write_audit_log(
      resolved_event,
      'email_send_log',
      COALESCE(NEW.message_id, NEW.id::text),
      auth.uid(),
      ARRAY[
        COALESCE(NEW.template_name, ''),
        COALESCE(NEW.recipient_email, ''),
        COALESCE(NEW.status, ''),
        'transition:' || COALESCE(OLD.status,'null') || '->' || NEW.status
      ],
      NEW.error_message
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_audit_email_send_log ON public.email_send_log;
CREATE TRIGGER trg_audit_email_send_log
AFTER INSERT OR UPDATE ON public.email_send_log
FOR EACH ROW EXECUTE FUNCTION public.audit_email_send_log();

-- RPC for the Activity Log "silent failures" panel on System Health.
CREATE OR REPLACE FUNCTION public.get_top_silent_failures(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 25
)
RETURNS TABLE (
  event_type text,
  table_name text,
  occurrences bigint,
  last_seen timestamptz,
  sample_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    al.event_type,
    al.table_name,
    COUNT(*)::bigint AS occurrences,
    MAX(al.created_at) AS last_seen,
    (ARRAY_AGG(al.error_message ORDER BY al.created_at DESC)
        FILTER (WHERE al.error_message IS NOT NULL))[1] AS sample_error
  FROM public.audit_log al
  WHERE al.created_at >= now() - make_interval(hours => GREATEST(p_hours, 1))
    AND (
      al.event_type LIKE '%_failed'
      OR al.event_type LIKE 'client_error%'
      OR al.event_type = 'edge_function_error'
      OR al.event_type LIKE 'ui_%'
      OR al.event_type = 'external_api_failed'
      OR al.event_type IN (
        'authn_unauthorized',
        'authz_admin_denied',
        'authz_check_failed',
        'malicious_webhook_signature_invalid'
      )
    )
  GROUP BY al.event_type, al.table_name
  ORDER BY occurrences DESC, last_seen DESC
  LIMIT GREATEST(p_limit, 1);
$$;

REVOKE ALL ON FUNCTION public.get_top_silent_failures(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_silent_failures(integer, integer) TO authenticated;

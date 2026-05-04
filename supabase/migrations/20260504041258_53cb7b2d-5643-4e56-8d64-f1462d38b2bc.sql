
-- 1. Latest-status helpers (admin / service-role only). They dedupe email_send_log
--    by message_id and return the rows whose CURRENT status matches the filter.
--    Used by resend-signup-confirmations to avoid inflating "stuck" counts with
--    pending rows that already have a later 'sent' row.
CREATE OR REPLACE FUNCTION public.email_send_log_latest_stuck(
  p_template_name text,
  p_older_than timestamptz
) RETURNS TABLE(message_id text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_id, created_at
  FROM (
    SELECT DISTINCT ON (message_id) message_id, status, template_name, created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND template_name = p_template_name
    ORDER BY message_id, created_at DESC
  ) latest
  WHERE status = 'pending'
    AND created_at < p_older_than;
$$;

CREATE OR REPLACE FUNCTION public.email_send_log_latest_failed(
  p_template_name text,
  p_since timestamptz
) RETURNS TABLE(message_id text, status text, error_message text, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT message_id, status, error_message, created_at
  FROM (
    SELECT DISTINCT ON (message_id) message_id, status, template_name, error_message, created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND template_name = p_template_name
    ORDER BY message_id, created_at DESC
  ) latest
  WHERE status IN ('failed', 'dlq')
    AND created_at >= p_since;
$$;

REVOKE ALL ON FUNCTION public.email_send_log_latest_stuck(text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_send_log_latest_failed(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_send_log_latest_stuck(text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_send_log_latest_failed(text, timestamptz) TO service_role;

-- 2. Loosen Top Errors so fingerprinted health alerts are visible in System Health
--    even when error_message is NULL. This keeps observability parity with the
--    Activity Log without changing UI/UX.
CREATE OR REPLACE FUNCTION public.get_top_error_fingerprints(
  p_hours integer DEFAULT 24,
  p_limit integer DEFAULT 10
) RETURNS TABLE(
  fingerprint text,
  event_type text,
  table_name text,
  occurrences bigint,
  affected_users bigint,
  first_seen timestamptz,
  last_seen timestamptz,
  sample_message text
)
LANGUAGE plpgsql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hours integer := LEAST(GREATEST(COALESCE(p_hours, 24), 1), 720);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100);
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH windowed AS (
    SELECT a.error_fingerprint, a.event_type, a.table_name, a.user_id,
           COALESCE(a.error_message, a.event_type || ' (no message)') AS error_message,
           a.created_at
      FROM public.audit_log a
     WHERE a.error_fingerprint IS NOT NULL
       AND (
         a.error_message IS NOT NULL
         -- include health/pipeline alerts even when message is NULL
         OR a.event_type ILIKE '%unhealthy%'
         OR a.event_type ILIKE '%pipeline%'
         OR a.event_type ILIKE '%alert%'
         OR a.event_type ILIKE '%failure%'
       )
       AND a.created_at >= now() - make_interval(hours => v_hours)
  )
  SELECT w.error_fingerprint,
         (array_agg(w.event_type ORDER BY w.created_at DESC))[1] AS event_type,
         (array_agg(w.table_name ORDER BY w.created_at DESC))[1] AS table_name,
         count(*)::bigint AS occurrences,
         count(DISTINCT w.user_id)::bigint AS affected_users,
         min(w.created_at) AS first_seen,
         max(w.created_at) AS last_seen,
         (array_agg(w.error_message ORDER BY w.created_at DESC))[1] AS sample_message
    FROM windowed w
   GROUP BY w.error_fingerprint
   ORDER BY occurrences DESC
   LIMIT v_limit;
END;
$$;

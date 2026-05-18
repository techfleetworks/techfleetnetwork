CREATE OR REPLACE FUNCTION public.get_email_pipeline_health(p_hours integer DEFAULT 24, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_hours integer := LEAST(GREATEST(COALESCE(p_hours, 24), 1), 720);
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  WITH latest_log AS (
    SELECT DISTINCT ON (message_id)
      message_id,
      template_name,
      recipient_email,
      status,
      error_message,
      metadata,
      created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
    ORDER BY message_id, created_at DESC
  ),
  filtered_log AS (
    SELECT *
    FROM latest_log
    WHERE created_at >= now() - make_interval(hours => v_hours)
  ),
  queue_stats AS (
    SELECT 'auth_emails'::text AS queue_name,
      count(*)::integer AS queued,
      count(*) FILTER (WHERE vt <= now())::integer AS ready,
      count(*) FILTER (WHERE vt > now())::integer AS delayed_or_inflight,
      coalesce(max(read_ct), 0)::integer AS max_attempts,
      min(enqueued_at) AS oldest_enqueued_at
    FROM pgmq.q_auth_emails
    UNION ALL
    SELECT 'transactional_emails'::text AS queue_name,
      count(*)::integer AS queued,
      count(*) FILTER (WHERE vt <= now())::integer AS ready,
      count(*) FILTER (WHERE vt > now())::integer AS delayed_or_inflight,
      coalesce(max(read_ct), 0)::integer AS max_attempts,
      min(enqueued_at) AS oldest_enqueued_at
    FROM pgmq.q_transactional_emails
  ),
  archive_stats AS (
    SELECT 'auth_emails'::text AS queue_name, count(*)::integer AS archived_last_24h
    FROM pgmq.a_auth_emails
    WHERE archived_at >= now() - interval '24 hours'
    UNION ALL
    SELECT 'transactional_emails'::text AS queue_name, count(*)::integer AS archived_last_24h
    FROM pgmq.a_transactional_emails
    WHERE archived_at >= now() - interval '24 hours'
  ),
  delivery_totals AS (
    SELECT
      count(*)::integer AS total,
      count(*) FILTER (WHERE status = 'sent')::integer AS sent,
      count(*) FILTER (WHERE status IN ('failed', 'dlq'))::integer AS failed,
      count(*) FILTER (WHERE status IN ('failed', 'dlq') AND created_at >= now() - interval '60 minutes')::integer AS failed_recent,
      count(*) FILTER (WHERE status = 'bounced')::integer AS bounced,
      count(*) FILTER (WHERE status = 'complained')::integer AS complained,
      count(*) FILTER (WHERE status = 'suppressed')::integer AS suppressed,
      count(*) FILTER (WHERE status = 'pending')::integer AS pending
    FROM filtered_log
  ),
  error_groups AS (
    SELECT
      coalesce(nullif(error_message, ''), 'Unknown error') AS error_message,
      status,
      count(*)::integer AS occurrences,
      max(created_at) AS last_seen_at
    FROM filtered_log
    WHERE status IN ('failed', 'dlq', 'bounced', 'complained') OR nullif(error_message, '') IS NOT NULL
    GROUP BY coalesce(nullif(error_message, ''), 'Unknown error'), status
    ORDER BY max(created_at) DESC
    LIMIT 10
  ),
  recent_logs AS (
    SELECT *
    FROM filtered_log
    ORDER BY created_at DESC
    LIMIT v_limit
  ),
  health AS (
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM public.email_send_state WHERE retry_after_until > now()) THEN 'overloaded'
        WHEN EXISTS (SELECT 1 FROM queue_stats WHERE queued > 100 OR max_attempts >= 4) THEN 'degraded'
        WHEN (SELECT failed_recent FROM delivery_totals) > 0 THEN 'degraded'
        ELSE 'healthy'
      END AS status,
      CASE
        WHEN EXISTS (SELECT 1 FROM public.email_send_state WHERE retry_after_until > now())
          THEN 'Email sending is paused briefly by our provider. We will retry automatically.'
        WHEN EXISTS (SELECT 1 FROM queue_stats WHERE queued > 100 OR max_attempts >= 4)
          THEN 'The email queue is catching up. New emails may take a few extra minutes.'
        WHEN (SELECT failed_recent FROM delivery_totals) > 0
          THEN 'We are looking into a few recent email failures. Open the Email tab to review.'
        WHEN (SELECT failed FROM delivery_totals) > 0
          THEN 'All recent failures have been reviewed. Email delivery looks healthy.'
        ELSE 'Email queues and recent delivery logs look healthy.'
      END AS reason
  )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'window_hours', v_hours,
    'health', (SELECT jsonb_build_object('status', status, 'reason', reason) FROM health),
    'send_state', (
      SELECT to_jsonb(s)
      FROM public.email_send_state s
      WHERE id = 1
    ),
    'queue_stats', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'queue_name', qs.queue_name,
        'queued', qs.queued,
        'ready', qs.ready,
        'delayed_or_inflight', qs.delayed_or_inflight,
        'max_attempts', qs.max_attempts,
        'oldest_enqueued_at', qs.oldest_enqueued_at,
        'archived_last_24h', coalesce(ars.archived_last_24h, 0)
      ) ORDER BY qs.queue_name), '[]'::jsonb)
      FROM queue_stats qs
      LEFT JOIN archive_stats ars ON ars.queue_name = qs.queue_name
    ),
    'delivery_totals', (SELECT to_jsonb(delivery_totals) FROM delivery_totals),
    'recent_errors', (
      SELECT coalesce(jsonb_agg(to_jsonb(error_groups)), '[]'::jsonb)
      FROM error_groups
    ),
    'recent_logs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'message_id', message_id,
        'template_name', template_name,
        'recipient_email', recipient_email,
        'status', status,
        'error_message', error_message,
        'created_at', created_at
      ) ORDER BY created_at DESC), '[]'::jsonb)
      FROM recent_logs
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
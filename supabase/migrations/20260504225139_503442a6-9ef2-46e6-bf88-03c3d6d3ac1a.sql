INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status, error_message, created_at)
SELECT message_id, template_name, recipient_email, 'suppressed', 'auto-suppressed orphan: pending >30d, no live send found', now()
FROM public.email_send_log
WHERE message_id = 'interview-invite-b3cc12aa-9594-4b72-8419-465012f3732f'
  AND status = 'pending'
LIMIT 1;

CREATE OR REPLACE FUNCTION public.email_send_log_latest_stuck(
  p_template_name text,
  p_older_than timestamp with time zone
)
RETURNS TABLE(message_id text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT message_id, created_at
  FROM (
    SELECT DISTINCT ON (message_id) message_id, status, template_name, created_at
    FROM public.email_send_log
    WHERE message_id IS NOT NULL
      AND template_name = p_template_name
    ORDER BY message_id, created_at DESC
  ) latest
  WHERE status = 'pending'
    AND created_at < p_older_than
    AND created_at >= (now() - interval '7 days');
$function$;
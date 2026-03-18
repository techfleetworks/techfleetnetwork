-- Trigger function to audit email pipeline events into audit_log
CREATE OR REPLACE FUNCTION public.audit_email_send_log()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields, error_message)
    VALUES (
      CASE NEW.status
        WHEN 'pending'      THEN 'email_queued'
        WHEN 'sent'         THEN 'email_sent'
        WHEN 'failed'       THEN 'email_failed'
        WHEN 'dlq'          THEN 'email_dlq'
        WHEN 'rate_limited' THEN 'email_rate_limited'
        WHEN 'suppressed'   THEN 'email_suppressed'
        WHEN 'bounced'      THEN 'email_bounced'
        WHEN 'complained'   THEN 'email_complained'
        ELSE 'email_' || NEW.status
      END,
      'email_send_log',
      COALESCE(NEW.message_id, NEW.id::text),
      NULL,
      ARRAY[
        COALESCE(NEW.template_name, ''),
        COALESCE(NEW.recipient_email, ''),
        COALESCE(NEW.status, '')
      ],
      NEW.error_message
    );
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER trg_audit_email_send_log
  AFTER INSERT ON public.email_send_log
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_email_send_log();

-- Notify admins via in-app notifications when error events are logged to audit_log
CREATE OR REPLACE FUNCTION public.notify_admin_on_audit_error()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_admin record;
  v_title text;
  v_body text;
BEGIN
  -- Only fire for error-type events
  IF NEW.event_type NOT IN ('client_error', 'error', 'failed') AND
     NEW.error_message IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := 'Error: ' || NEW.event_type || ' in ' || NEW.table_name;
  v_body := '<p><strong>Event:</strong> ' || NEW.event_type || '</p>' ||
            '<p><strong>Table:</strong> ' || NEW.table_name || '</p>' ||
            CASE WHEN NEW.record_id IS NOT NULL
              THEN '<p><strong>Record:</strong> ' || NEW.record_id || '</p>'
              ELSE '' END ||
            CASE WHEN NEW.error_message IS NOT NULL
              THEN '<p><strong>Error:</strong> ' || LEFT(NEW.error_message, 300) ||
                   CASE WHEN LENGTH(NEW.error_message) > 300 THEN '…' ELSE '' END || '</p>'
              ELSE '' END;

  FOR v_admin IN
    SELECT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
    VALUES (
      v_admin.user_id,
      v_title,
      v_body,
      'error_alert',
      '/admin/activity-log'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_audit_error ON public.audit_log;
CREATE TRIGGER trg_notify_admin_audit_error
  AFTER INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_on_audit_error();

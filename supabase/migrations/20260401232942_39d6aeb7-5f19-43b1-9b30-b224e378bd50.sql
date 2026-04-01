CREATE OR REPLACE FUNCTION public.notify_admin_on_audit_error()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
  v_title text;
  v_body text;
BEGIN
  -- Skip non-error event types (info/sync events that happen to have error_message)
  IF NEW.event_type IN (
    'class_cert_sync_no_results',
    'project_cert_sync_no_results',
    'class_cert_sync_started',
    'project_cert_sync_started',
    'class_cert_sync_completed',
    'project_cert_sync_completed',
    'class_cert_name_resolution_partial',
    'project_cert_name_resolution_partial'
  ) THEN
    RETURN NEW;
  END IF;

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
$function$;
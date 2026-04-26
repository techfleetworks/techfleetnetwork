CREATE OR REPLACE FUNCTION public.notify_admin_login_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'authn_admin_login_success' THEN
    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url, source)
    SELECT
      ur.user_id,
      'Admin login detected',
      'An administrator account signed in. Review the activity log if this was unexpected.',
      'security',
      '/admin/activity-log',
      'admin_login_alert'
    FROM public.user_roles ur
    WHERE ur.role = 'admin'::public.app_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_login_event ON public.audit_log;
CREATE TRIGGER trg_notify_admin_login_event
AFTER INSERT ON public.audit_log
FOR EACH ROW
WHEN (NEW.event_type = 'authn_admin_login_success')
EXECUTE FUNCTION public.notify_admin_login_event();
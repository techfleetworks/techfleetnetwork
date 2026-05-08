CREATE OR REPLACE FUNCTION public.trg_notify_class_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link text;
  v_admin record;
  v_reason text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  v_link := '/teach/classes/' || NEW.id::text;

  -- draft -> pending_review : notify all admins
  IF OLD.status = 'draft' AND NEW.status = 'pending_review' THEN
    FOR v_admin IN
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (
        v_admin.user_id,
        'Class submitted for review',
        '<p>A teacher submitted "<strong>' || NEW.title || '</strong>" for review.</p>',
        'class_submitted_for_review',
        '/admin/classes'
      );
    END LOOP;

  -- pending_review -> published : notify the owner
  ELSIF OLD.status = 'pending_review' AND NEW.status = 'published' THEN
    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
    VALUES (
      NEW.owner_user_id,
      'Your class was approved',
      '<p>"<strong>' || NEW.title || '</strong>" has been published.</p>',
      'class_approved',
      v_link
    );

  -- pending_review -> draft : notify the owner with the latest reason
  ELSIF OLD.status = 'pending_review' AND NEW.status = 'draft' THEN
    SELECT reason INTO v_reason
      FROM public.class_audit
      WHERE class_id = NEW.id AND action = 'request_changes'
      ORDER BY created_at DESC
      LIMIT 1;

    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
    VALUES (
      NEW.owner_user_id,
      'Changes requested on your class',
      '<p>An admin requested changes on "<strong>' || NEW.title || '</strong>".</p>'
        || COALESCE('<blockquote>' || v_reason || '</blockquote>', ''),
      'class_changes_requested',
      v_link
    );

  -- * -> archived : notify the owner
  ELSIF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
    VALUES (
      NEW.owner_user_id,
      'Your class was archived',
      '<p>"<strong>' || NEW.title || '</strong>" has been archived.</p>',
      'class_archived',
      v_link
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the status transition on a notification failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS class_status_notify ON public.classes;
CREATE TRIGGER class_status_notify
AFTER UPDATE OF status ON public.classes
FOR EACH ROW
EXECUTE FUNCTION public.trg_notify_class_status_change();

CREATE OR REPLACE FUNCTION public.count_classes_pending_review()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.classes
   WHERE status = 'pending_review'
     AND public.has_role(auth.uid(), 'admin');
$$;

REVOKE EXECUTE ON FUNCTION public.count_classes_pending_review() FROM anon;
GRANT EXECUTE ON FUNCTION public.count_classes_pending_review() TO authenticated;
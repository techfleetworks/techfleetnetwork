CREATE OR REPLACE FUNCTION public.notify_project_opening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_project_type text;
  v_phase text;
  v_body text;
  v_user record;
  v_should_notify boolean := false;
  v_message_id text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.project_status = 'apply_now' THEN
    v_should_notify := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.project_status = 'apply_now' AND (OLD.project_status IS DISTINCT FROM 'apply_now') THEN
    v_should_notify := true;
  END IF;

  IF v_should_notify THEN
    SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
    v_project_type := REPLACE(INITCAP(REPLACE(NEW.project_type::text, '_', ' ')), '_', ' ');
    v_phase := REPLACE(INITCAP(REPLACE(NEW.phase::text, '_', ' ')), '_', ' ');

    v_body := '<p><strong>Client:</strong> ' || COALESCE(v_client_name, 'Unknown') ||
              '</p><p><strong>Project Type:</strong> ' || v_project_type ||
              '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';

    FOR v_user IN
      SELECT p.user_id, p.email, p.notify_announcements, p.first_name
      FROM public.profiles p
      WHERE p.notify_training_opportunities = true
        AND 'Train on project teams' = ANY(p.interests)
    LOOP
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (
        v_user.user_id,
        'ALERT! New Project Training Opportunity',
        v_body,
        'project_opening',
        '/project-openings/' || NEW.id
      );

      IF v_user.notify_announcements = true AND v_user.email != '' THEN
        v_message_id := gen_random_uuid()::text;
        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'to', v_user.email,
            'subject', 'ALERT! New Project Training Opportunity',
            'html', '<h2>ALERT! New Project Training Opportunity</h2>' ||
                    '<p>Hi ' || COALESCE(v_user.first_name, 'there') || ',</p>' ||
                    '<p>A new project training opportunity is now open for applications!</p>' ||
                    v_body ||
                    '<p><a href="https://techfleetnetwork.lovable.app/project-openings/' || NEW.id || '">View Project &amp; Apply</a></p>',
            'purpose', 'transactional',
            'label', 'project_opening_alert',
            'message_id', v_message_id,
            'queued_at', now()::text
          )
        );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
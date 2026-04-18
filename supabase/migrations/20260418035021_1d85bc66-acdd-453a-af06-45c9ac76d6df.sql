CREATE OR REPLACE FUNCTION public.notify_project_opening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_friendly_name text;
  v_project_label text;
  v_project_type text;
  v_phase text;
  v_old_status text;
  v_new_status text;
  v_body text;
  v_plain_text text;
  v_user record;
  v_is_apply_now boolean := false;
  v_is_status_change boolean := false;
  v_title text;
  v_email_subject text;
  v_message_id text;
  v_unsub_token text;
BEGIN
  -- Detect events
  IF TG_OP = 'INSERT' AND NEW.project_status = 'apply_now' THEN
    v_is_apply_now := true;
    v_is_status_change := true;
  ELSIF TG_OP = 'UPDATE' AND NEW.project_status IS DISTINCT FROM OLD.project_status THEN
    v_is_status_change := true;
    IF NEW.project_status = 'apply_now' AND OLD.project_status IS DISTINCT FROM 'apply_now' THEN
      v_is_apply_now := true;
    END IF;
  END IF;

  IF NOT v_is_status_change THEN
    RETURN NEW;
  END IF;

  -- Resolve labels
  SELECT name INTO v_client_name FROM public.clients WHERE id = NEW.client_id;
  v_friendly_name := COALESCE(NULLIF(NEW.friendly_name, ''), '');
  v_project_label := COALESCE(NULLIF(v_client_name, ''), 'Unknown')
                  || CASE WHEN v_friendly_name <> '' THEN ' — ' || v_friendly_name ELSE '' END;
  v_project_type := REPLACE(INITCAP(REPLACE(NEW.project_type::text, '_', ' ')), '_', ' ');
  v_phase := REPLACE(INITCAP(REPLACE(NEW.phase::text, '_', ' ')), '_', ' ');
  v_new_status := REPLACE(INITCAP(REPLACE(NEW.project_status::text, '_', ' ')), '_', ' ');
  v_old_status := CASE WHEN TG_OP = 'UPDATE' AND OLD.project_status IS NOT NULL
                       THEN REPLACE(INITCAP(REPLACE(OLD.project_status::text, '_', ' ')), '_', ' ')
                       ELSE NULL END;

  -- Choose copy based on whether this is the apply_now milestone or another status change
  IF v_is_apply_now THEN
    v_title := 'ALERT! New Project Training Opportunity';
    v_email_subject := 'ALERT! New Project Training Opportunity';
    v_body := '<p><strong>Project:</strong> ' || v_project_label ||
              '</p><p><strong>Project Type:</strong> ' || v_project_type ||
              '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'Project Type: ' || v_project_type || E'\n' ||
                    'Phase: ' || v_phase;
  ELSE
    v_title := 'Project Status Update: ' || v_project_label;
    v_email_subject := 'Project Status Update: ' || v_project_label;
    v_body := '<p><strong>Project:</strong> ' || v_project_label ||
              '</p><p><strong>New Status:</strong> ' || v_new_status ||
              CASE WHEN v_old_status IS NOT NULL
                   THEN '</p><p><strong>Previous Status:</strong> ' || v_old_status
                   ELSE '' END ||
              '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'New Status: ' || v_new_status || E'\n' ||
                    COALESCE('Previous Status: ' || v_old_status || E'\n', '') ||
                    'Phase: ' || v_phase;
  END IF;

  FOR v_user IN
    SELECT p.user_id, p.email, p.notify_announcements, p.first_name
    FROM public.profiles p
    WHERE p.notify_training_opportunities = true
      AND 'Train on project teams' = ANY(p.interests)
  LOOP
    -- In-app notification (gated by notify_training_opportunities, already in WHERE)
    BEGIN
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (
        v_user.user_id,
        v_title,
        v_body,
        'project_opening',
        '/project-openings/' || NEW.id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notify_project_opening: notification insert failed for %: %', v_user.user_id, SQLERRM;
    END;

    -- Email only if the user has also opted in to email alerts
    IF v_user.notify_announcements = true AND v_user.email <> '' THEN
      BEGIN
        v_message_id := 'project-status-' || NEW.id || '-' || NEW.project_status::text || '-' || v_user.user_id;

        v_unsub_token := encode(extensions.gen_random_bytes(32), 'hex');
        INSERT INTO public.email_unsubscribe_tokens (email, token)
        VALUES (v_user.email, v_unsub_token);

        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'to', v_user.email,
            'subject', v_email_subject,
            'html', '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;"><div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;"><div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e4e4e7;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Tech Fleet Project Alert</h1></div><h2 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px 0;">' || v_title || '</h2><p style="font-size: 15px; line-height: 1.6; color: #3f3f46;">Hi ' || COALESCE(v_user.first_name, 'there') || ',</p><div style="font-size: 15px; line-height: 1.6; color: #3f3f46;">' || v_body || '</div><div style="text-align: center; margin: 24px 0;"><a href="https://techfleetnetwork.lovable.app/project-openings/' || NEW.id || '" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Project</a></div><hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" /><p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0;">You received this because you opted in to training opportunity alerts on Tech Fleet Network.<br/>To unsubscribe, <a href="https://techfleetnetwork.lovable.app/profile/edit?tab=preferences" style="color: #3b82f6; text-decoration: underline;">update your notification preferences</a> in your profile settings.</p></div></div></body></html>',
            'text', 'Hi ' || COALESCE(v_user.first_name, 'there') || E',\n\n' || v_title || E'\n\n' || v_plain_text || E'\n\nView project: https://techfleetnetwork.lovable.app/project-openings/' || NEW.id,
            'from', 'Tech Fleet <notifications@notify.techfleet.org>',
            'sender_domain', 'notify.techfleet.org',
            'purpose', 'transactional',
            'label', 'project_opening_alert',
            'message_id', v_message_id,
            'idempotency_key', v_message_id,
            'unsubscribe_token', v_unsub_token,
            'queued_at', now()::text
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_project_opening: email enqueue failed for %: %', v_user.email, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
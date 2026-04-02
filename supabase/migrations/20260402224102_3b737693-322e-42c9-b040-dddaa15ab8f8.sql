CREATE OR REPLACE FUNCTION public.notify_feedback_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin record;
  v_body text;
  v_submitter_name text;
  v_message_id text;
  v_plain_text text;
  v_unsub_token text;
BEGIN
  BEGIN
    SELECT COALESCE(NULLIF(display_name, ''), NULLIF(first_name, ''), 'A member')
      INTO v_submitter_name
      FROM public.profiles WHERE user_id = NEW.user_id;

    v_body := '<p><strong>From:</strong> ' || COALESCE(v_submitter_name, 'Unknown') ||
              ' (' || NEW.user_email || ')</p>' ||
              '<p><strong>Area:</strong> ' || NEW.system_area || '</p>' ||
              '<p>' || LEFT(NEW.message, 200) ||
              CASE WHEN LENGTH(NEW.message) > 200 THEN '…' ELSE '' END || '</p>';

    v_plain_text := 'From: ' || COALESCE(v_submitter_name, 'Unknown') ||
                    ' (' || NEW.user_email || ')' || E'\n' ||
                    'Area: ' || NEW.system_area || E'\n\n' ||
                    LEFT(NEW.message, 300) ||
                    CASE WHEN LENGTH(NEW.message) > 300 THEN '…' ELSE '' END;

    FOR v_admin IN
      SELECT p.user_id, p.email, p.notify_announcements, p.first_name
      FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.role = 'admin'
    LOOP
      BEGIN
        INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
        VALUES (
          v_admin.user_id,
          'New Feedback: ' || NEW.system_area,
          v_body,
          'feedback',
          '/feedback'
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_feedback: notification insert failed for admin %: %', v_admin.user_id, SQLERRM;
      END;

      IF v_admin.notify_announcements = true AND v_admin.email != '' THEN
        BEGIN
          v_message_id := 'feedback-' || NEW.id || '-' || v_admin.user_id;

          v_unsub_token := encode(gen_random_bytes(32), 'hex');
          INSERT INTO public.email_unsubscribe_tokens (email, token)
          VALUES (v_admin.email, v_unsub_token);

          PERFORM public.enqueue_email(
            'transactional_emails',
            jsonb_build_object(
              'to', v_admin.email,
              'subject', 'New Feedback Submitted: ' || NEW.system_area,
              'html', '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;"><div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;"><div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e4e4e7;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="font-size: 14px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin: 0;">Tech Fleet Feedback</h1></div><h2 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px 0;">New Feedback Submitted</h2><p style="font-size: 15px; line-height: 1.6; color: #3f3f46;">Hi ' || COALESCE(v_admin.first_name, 'Admin') || ',</p><p style="font-size: 15px; line-height: 1.6; color: #3f3f46;">A member has submitted feedback about <strong>' || NEW.system_area || '</strong>.</p><div style="background: #f4f4f5; border-radius: 6px; padding: 16px; margin: 16px 0;"><p style="font-size: 13px; font-weight: 600; color: #71717a; margin: 0 0 4px;">From: ' || COALESCE(v_submitter_name, 'Unknown') || ' (' || NEW.user_email || ')</p><p style="font-size: 14px; line-height: 1.5; color: #3f3f46; margin: 8px 0 0;">' || LEFT(NEW.message, 300) || CASE WHEN LENGTH(NEW.message) > 300 THEN '…' ELSE '' END || '</p></div><div style="text-align: center; margin: 24px 0;"><a href="https://techfleetnetwork.lovable.app/feedback" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View All Feedback</a></div><hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" /><p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0;">You received this because you are an admin on Tech Fleet Network.<br/>To unsubscribe, <a href="https://techfleetnetwork.lovable.app/profile/edit?tab=preferences" style="color: #3b82f6; text-decoration: underline;">update your notification preferences</a> in your profile settings.</p></div></div></body></html>',
              'text', 'Hi ' || COALESCE(v_admin.first_name, 'Admin') || E',\n\nNew feedback submitted about ' || NEW.system_area || E'.\n\n' || v_plain_text || E'\n\nView all feedback: https://techfleetnetwork.lovable.app/feedback',
              'from', 'Tech Fleet <notifications@notify.techfleet.org>',
              'sender_domain', 'notify.techfleet.org',
              'purpose', 'transactional',
              'label', 'feedback_alert',
              'message_id', v_message_id,
              'idempotency_key', v_message_id,
              'unsubscribe_token', v_unsub_token,
              'queued_at', now()::text
            )
          );
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'notify_feedback: email enqueue failed for %: %', v_admin.email, SQLERRM;
        END;
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_feedback_submitted failed entirely: %', SQLERRM;
  END;

  RETURN NEW;
END;
$function$
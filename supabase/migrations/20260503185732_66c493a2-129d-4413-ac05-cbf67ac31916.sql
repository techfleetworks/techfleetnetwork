-- Fix fanout token bug + observability + backfill
CREATE OR REPLACE FUNCTION public.process_notification_fanout_chunk(p_job_id uuid, p_chunk_size integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_job              public.notification_fanout_jobs%ROWTYPE;
  v_payload          jsonb;
  v_project_id       uuid;
  v_client_name      text;
  v_friendly_name    text;
  v_project_label    text;
  v_project_type     text;
  v_phase            text;
  v_new_status_label text;
  v_old_status_label text;
  v_is_apply_now     boolean;
  v_title            text;
  v_body             text;
  v_plain_text       text;
  v_user             record;
  v_message_id       text;
  v_unsub_token      text;
  v_processed        integer := 0;
  v_total_after      integer;
  v_remaining        integer;
BEGIN
  SELECT * INTO v_job FROM public.notification_fanout_jobs WHERE id = p_job_id FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed',0,'remaining',0,'done',true,'job_id',p_job_id,'skipped',true);
  END IF;
  IF v_job.status = 'done' THEN
    RETURN jsonb_build_object('processed',0,'remaining',0,'done',true,'job_id',p_job_id);
  END IF;

  v_payload      := v_job.payload;
  v_project_id   := (v_payload->>'project_id')::uuid;
  v_is_apply_now := COALESCE((v_payload->>'is_apply_now')::boolean, false);

  SELECT name INTO v_client_name FROM public.clients WHERE id = (v_payload->>'client_id')::uuid;
  v_friendly_name    := COALESCE(NULLIF(v_payload->>'friendly_name', ''), '');
  v_project_label    := COALESCE(NULLIF(v_client_name, ''), 'Unknown') ||
                        CASE WHEN v_friendly_name <> '' THEN ' — ' || v_friendly_name ELSE '' END;
  v_project_type     := REPLACE(INITCAP(REPLACE(v_payload->>'project_type', '_', ' ')), '_', ' ');
  v_phase            := REPLACE(INITCAP(REPLACE(v_payload->>'phase', '_', ' ')), '_', ' ');
  v_new_status_label := REPLACE(INITCAP(REPLACE(v_payload->>'new_status', '_', ' ')), '_', ' ');
  v_old_status_label := CASE WHEN v_payload->>'old_status' IS NOT NULL
                             THEN REPLACE(INITCAP(REPLACE(v_payload->>'old_status', '_', ' ')), '_', ' ') END;

  IF v_is_apply_now THEN
    v_title      := 'ALERT! New Project Training Opportunity';
    v_body       := '<p><strong>Project:</strong> ' || v_project_label ||
                    '</p><p><strong>Project Type:</strong> ' || v_project_type ||
                    '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'Project Type: ' || v_project_type || E'\n' || 'Phase: ' || v_phase;
  ELSE
    v_title      := 'Project Status Update: ' || v_project_label;
    v_body       := '<p><strong>Project:</strong> ' || v_project_label ||
                    '</p><p><strong>New Status:</strong> ' || v_new_status_label ||
                    CASE WHEN v_old_status_label IS NOT NULL
                         THEN '</p><p><strong>Previous Status:</strong> ' || v_old_status_label ELSE '' END ||
                    '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'New Status: ' || v_new_status_label || E'\n' ||
                    COALESCE('Previous Status: ' || v_old_status_label || E'\n', '') ||
                    'Phase: ' || v_phase;
  END IF;

  UPDATE public.notification_fanout_jobs
     SET status='running', attempts=attempts+1, started_at=COALESCE(started_at, now())
   WHERE id = p_job_id;

  FOR v_user IN
    SELECT p.user_id, p.email, p.notify_announcements, p.first_name
    FROM public.profiles p
    WHERE p.notify_training_opportunities = true
      AND 'Train on project teams' = ANY(p.interests)
    ORDER BY p.user_id
    OFFSET v_job.next_offset
    LIMIT p_chunk_size
  LOOP
    BEGIN
      INSERT INTO public.notifications (user_id, title, body_html, notification_type, link_url)
      VALUES (v_user.user_id, v_title, v_body, 'project_opening', '/project-openings/' || v_project_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fanout: notification insert failed for %: %', v_user.user_id, SQLERRM;
    END;

    IF v_user.notify_announcements = true AND v_user.email <> '' THEN
      BEGIN
        v_message_id := 'project-status-' || v_project_id || '-' || (v_payload->>'new_status') || '-' || v_user.user_id;

        -- One token per email (Email Infra rule). Reuse existing if present.
        INSERT INTO public.email_unsubscribe_tokens (email, token)
        VALUES (v_user.email, encode(extensions.gen_random_bytes(32), 'hex'))
        ON CONFLICT (email) DO NOTHING;
        SELECT token INTO v_unsub_token FROM public.email_unsubscribe_tokens WHERE email = v_user.email;

        PERFORM public.enqueue_email(
          'transactional_emails',
          jsonb_build_object(
            'to', v_user.email,
            'subject', v_title,
            'html', '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; padding: 0; background-color: #f4f4f5;"><div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;"><div style="background: #ffffff; border-radius: 8px; padding: 32px; border: 1px solid #e4e4e7;"><h2 style="font-size: 22px; font-weight: 700; color: #18181b; margin: 0 0 16px;">' || v_title || '</h2><p style="font-size: 15px; line-height: 1.6; color: #3f3f46;">Hi ' || COALESCE(v_user.first_name, 'there') || ',</p><div style="font-size: 15px; line-height: 1.6; color: #3f3f46;">' || v_body || '</div><div style="text-align: center; margin: 24px 0;"><a href="https://techfleetnetwork.lovable.app/project-openings/' || v_project_id || '" style="display: inline-block; background-color: #18181b; color: #ffffff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 6px; text-decoration: none;">View Project</a></div><hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" /><p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0;">You received this because you opted in to training opportunity alerts on Tech Fleet Network.<br/><a href="https://techfleetnetwork.lovable.app/profile/edit?tab=preferences" style="color: #3b82f6;">Update notification preferences</a></p></div></div></body></html>',
            'text', 'Hi ' || COALESCE(v_user.first_name, 'there') || E',\n\n' || v_title || E'\n\n' || v_plain_text || E'\n\nView project: https://techfleetnetwork.lovable.app/project-openings/' || v_project_id,
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
        -- Surface to system-health so silent drops can't recur.
        BEGIN
          INSERT INTO public.email_send_log (recipient_email, template_name, status, error_message, message_id, metadata)
          VALUES (v_user.email, 'project_opening_alert', 'failed', SQLERRM, v_message_id,
                  jsonb_build_object('source','fanout','job_id',p_job_id,'project_id',v_project_id));
        EXCEPTION WHEN OTHERS THEN NULL; END;
        RAISE WARNING 'fanout: email enqueue failed for %: %', v_user.email, SQLERRM;
      END;
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  SELECT count(*) INTO v_total_after
  FROM public.profiles p
  WHERE p.notify_training_opportunities = true AND 'Train on project teams' = ANY(p.interests);
  v_remaining := GREATEST(v_total_after - (v_job.next_offset + v_processed), 0);

  IF v_remaining = 0 THEN
    UPDATE public.notification_fanout_jobs SET status='done', next_offset=v_job.next_offset+v_processed, finished_at=now() WHERE id=p_job_id;
  ELSE
    UPDATE public.notification_fanout_jobs SET status='pending', next_offset=v_job.next_offset+v_processed WHERE id=p_job_id;
  END IF;

  RETURN jsonb_build_object('processed',v_processed,'remaining',v_remaining,'done',v_remaining=0,'job_id',p_job_id);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.notification_fanout_jobs SET status='error', last_error=SQLERRM WHERE id=p_job_id;
  RAISE;
END;
$function$;

-- Backfill: re-enqueue the two May 1 fanout jobs that silently dropped 28 users each.
INSERT INTO public.notification_fanout_jobs (source, payload, status, next_offset)
SELECT source, payload || jsonb_build_object('backfill_of', id::text), 'pending', 0
FROM public.notification_fanout_jobs
WHERE id IN ('7eb23890-651c-4eaf-b360-0ddf668c0b7a','8d26c0c5-c1dd-413e-8f77-df371f4d7c29');
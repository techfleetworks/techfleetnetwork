-- ============================================================================
-- Audit 2026-04-18 — two-step notification fanout for project openings.
-- ============================================================================
-- The previous notify_project_opening trigger looped over every matching
-- profile inside the projects-UPDATE transaction, doing one notifications
-- INSERT + (optional) email enqueue per matching user. At 10k matching users
-- that became 10k row-by-row writes inside the write transaction, holding
-- locks on `projects`, `notifications`, and the pgmq queue and risking
-- statement timeouts on the upsert path itself.
--
-- New shape: the trigger drops a *single* job row into
-- public.notification_fanout_jobs and returns immediately. A scheduled
-- edge function (process-notification-fanout) drains the queue out-of-band
-- in 500-row chunks. The audit explicitly flagged this as the highest
-- priority change regardless of plan tier.
-- ============================================================================

-- 1. Job table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_fanout_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,                     -- e.g. 'project_status_change'
  payload     jsonb NOT NULL,                    -- everything the worker needs
  status      text NOT NULL DEFAULT 'pending',   -- pending | running | done | error
  attempts    integer NOT NULL DEFAULT 0,
  last_error  text,
  next_offset integer NOT NULL DEFAULT 0,        -- pagination cursor for the worker
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_fanout_jobs_pending
  ON public.notification_fanout_jobs (created_at)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.notification_fanout_jobs ENABLE ROW LEVEL SECURITY;

-- Only admins can read fanout jobs (operational visibility).
DROP POLICY IF EXISTS "admins can view fanout jobs" ON public.notification_fanout_jobs;
CREATE POLICY "admins can view fanout jobs"
  ON public.notification_fanout_jobs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Service role bypasses RLS, but no general INSERT/UPDATE/DELETE policy is
-- needed for end users — the trigger writes via SECURITY DEFINER and the
-- worker uses the service role client.

DROP TRIGGER IF EXISTS trg_fanout_jobs_updated_at ON public.notification_fanout_jobs;
CREATE TRIGGER trg_fanout_jobs_updated_at
  BEFORE UPDATE ON public.notification_fanout_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Replace the in-line trigger with a thin enqueue ----------------------
CREATE OR REPLACE FUNCTION public.notify_project_opening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_apply_now boolean := false;
  v_is_status_change boolean := false;
  v_old_status text;
  v_new_status text;
BEGIN
  -- Detect status changes (same logic as before, just no fanout work here).
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

  v_new_status := NEW.project_status::text;
  v_old_status := CASE WHEN TG_OP = 'UPDATE' AND OLD.project_status IS NOT NULL
                       THEN OLD.project_status::text
                       ELSE NULL END;

  -- Single insert — out-of-transaction worker handles the fanout.
  INSERT INTO public.notification_fanout_jobs (source, payload)
  VALUES (
    'project_status_change',
    jsonb_build_object(
      'project_id', NEW.id,
      'client_id', NEW.client_id,
      'friendly_name', COALESCE(NEW.friendly_name, ''),
      'project_type', NEW.project_type::text,
      'phase', NEW.phase::text,
      'old_status', v_old_status,
      'new_status', v_new_status,
      'is_apply_now', v_is_apply_now,
      'enqueued_at', now()::text
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the projects UPDATE because of fanout enqueue failures.
  RAISE WARNING 'notify_project_opening enqueue failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- 3. SECURITY DEFINER processor used by the edge function -----------------
-- Processes a single job in chunks. Returns:
--   { processed: int, remaining: int, done: boolean, job_id: uuid }
-- The edge function calls this in a loop until `done` is true (or until it
-- hits its own per-invocation budget).
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
  -- Atomically claim the job (row-level lock prevents two workers running it).
  SELECT * INTO v_job
  FROM public.notification_fanout_jobs
  WHERE id = p_job_id
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', 0, 'remaining', 0, 'done', true, 'job_id', p_job_id, 'skipped', true);
  END IF;

  IF v_job.status = 'done' THEN
    RETURN jsonb_build_object('processed', 0, 'remaining', 0, 'done', true, 'job_id', p_job_id);
  END IF;

  v_payload      := v_job.payload;
  v_project_id   := (v_payload->>'project_id')::uuid;
  v_is_apply_now := COALESCE((v_payload->>'is_apply_now')::boolean, false);

  -- Resolve human labels once per chunk (cheap relative to the loop).
  SELECT name INTO v_client_name FROM public.clients WHERE id = (v_payload->>'client_id')::uuid;
  v_friendly_name    := COALESCE(NULLIF(v_payload->>'friendly_name', ''), '');
  v_project_label    := COALESCE(NULLIF(v_client_name, ''), 'Unknown')
                     || CASE WHEN v_friendly_name <> '' THEN ' — ' || v_friendly_name ELSE '' END;
  v_project_type     := REPLACE(INITCAP(REPLACE(v_payload->>'project_type', '_', ' ')), '_', ' ');
  v_phase            := REPLACE(INITCAP(REPLACE(v_payload->>'phase', '_', ' ')), '_', ' ');
  v_new_status_label := REPLACE(INITCAP(REPLACE(v_payload->>'new_status', '_', ' ')), '_', ' ');
  v_old_status_label := CASE WHEN v_payload->>'old_status' IS NOT NULL
                             THEN REPLACE(INITCAP(REPLACE(v_payload->>'old_status', '_', ' ')), '_', ' ')
                             ELSE NULL END;

  IF v_is_apply_now THEN
    v_title      := 'ALERT! New Project Training Opportunity';
    v_body       := '<p><strong>Project:</strong> ' || v_project_label ||
                    '</p><p><strong>Project Type:</strong> ' || v_project_type ||
                    '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'Project Type: ' || v_project_type || E'\n' ||
                    'Phase: ' || v_phase;
  ELSE
    v_title      := 'Project Status Update: ' || v_project_label;
    v_body       := '<p><strong>Project:</strong> ' || v_project_label ||
                    '</p><p><strong>New Status:</strong> ' || v_new_status_label ||
                    CASE WHEN v_old_status_label IS NOT NULL
                         THEN '</p><p><strong>Previous Status:</strong> ' || v_old_status_label
                         ELSE '' END ||
                    '</p><p><strong>Phase:</strong> ' || v_phase || '</p>';
    v_plain_text := 'Project: ' || v_project_label || E'\n' ||
                    'New Status: ' || v_new_status_label || E'\n' ||
                    COALESCE('Previous Status: ' || v_old_status_label || E'\n', '') ||
                    'Phase: ' || v_phase;
  END IF;

  -- Mark running and bump attempts before doing the work.
  UPDATE public.notification_fanout_jobs
     SET status      = 'running',
         attempts    = attempts + 1,
         started_at  = COALESCE(started_at, now())
   WHERE id = p_job_id;

  -- Process the next chunk of recipients, ordered deterministically by user_id
  -- so the cursor (next_offset) maps cleanly across chunks.
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
      VALUES (v_user.user_id, v_title, v_body, 'project_opening',
              '/project-openings/' || v_project_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'fanout: notification insert failed for %: %', v_user.user_id, SQLERRM;
    END;

    IF v_user.notify_announcements = true AND v_user.email <> '' THEN
      BEGIN
        v_message_id := 'project-status-' || v_project_id || '-' || (v_payload->>'new_status') || '-' || v_user.user_id;
        v_unsub_token := encode(extensions.gen_random_bytes(32), 'hex');
        INSERT INTO public.email_unsubscribe_tokens (email, token)
        VALUES (v_user.email, v_unsub_token);

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
        RAISE WARNING 'fanout: email enqueue failed for %: %', v_user.email, SQLERRM;
      END;
    END IF;

    v_processed := v_processed + 1;
  END LOOP;

  -- How many recipients exist in total? Used to compute remaining + done.
  SELECT count(*) INTO v_total_after
  FROM public.profiles p
  WHERE p.notify_training_opportunities = true
    AND 'Train on project teams' = ANY(p.interests);

  v_remaining := GREATEST(v_total_after - (v_job.next_offset + v_processed), 0);

  IF v_remaining = 0 THEN
    UPDATE public.notification_fanout_jobs
       SET status      = 'done',
           next_offset = v_job.next_offset + v_processed,
           finished_at = now()
     WHERE id = p_job_id;
  ELSE
    UPDATE public.notification_fanout_jobs
       SET status      = 'pending',
           next_offset = v_job.next_offset + v_processed
     WHERE id = p_job_id;
  END IF;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'remaining', v_remaining,
    'done', v_remaining = 0,
    'job_id', p_job_id
  );
EXCEPTION WHEN OTHERS THEN
  UPDATE public.notification_fanout_jobs
     SET status     = 'error',
         last_error = SQLERRM
   WHERE id = p_job_id;
  RAISE;
END;
$function$;

-- 4. Helper: list pending jobs for the worker -----------------------------
CREATE OR REPLACE FUNCTION public.list_pending_fanout_jobs(p_limit integer DEFAULT 5)
RETURNS TABLE(id uuid, source text, attempts integer, created_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id, source, attempts, created_at
  FROM public.notification_fanout_jobs
  WHERE status IN ('pending', 'running')
  ORDER BY created_at
  LIMIT p_limit;
$function$;

-- 5. Single-round-trip dashboard payload ----------------------------------
-- Audit said DashboardPage.tsx fires ~8 queries on first paint. This RPC
-- returns everything one widget set needs in a single request.
CREATE OR REPLACE FUNCTION public.get_dashboard_overview(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phase_counts jsonb;
  v_general_app  jsonb;
  v_project_apps jsonb;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Per-phase completed counts in one scan instead of seven.
  SELECT jsonb_object_agg(phase::text, cnt) INTO v_phase_counts
  FROM (
    SELECT phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE user_id = p_user_id AND completed = true
    GROUP BY phase
  ) sub;

  SELECT to_jsonb(ga) INTO v_general_app
  FROM (
    SELECT id, status, completed_at, updated_at, current_section
    FROM public.general_applications
    WHERE user_id = p_user_id
    LIMIT 1
  ) ga;

  SELECT jsonb_agg(row_to_json(t)) INTO v_project_apps
  FROM (
    SELECT id, project_id, status, applicant_status, completed_at, updated_at,
           current_step, team_hats_interest
    FROM public.project_applications
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
  ) t;

  RETURN jsonb_build_object(
    'phase_counts', COALESCE(v_phase_counts, '{}'::jsonb),
    'general_application', v_general_app,
    'project_applications', COALESCE(v_project_apps, '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_overview(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_dashboard_overview(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.process_notification_fanout_chunk(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.process_notification_fanout_chunk(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.list_pending_fanout_jobs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.list_pending_fanout_jobs(integer) TO authenticated, service_role;

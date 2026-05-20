-- v4 trigger wiring (corrected: seed via direct INSERT, not by invoking trigger fn).

CREATE TABLE IF NOT EXISTS public.journey_phase_definitions (
  phase text PRIMARY KEY,
  required_tasks int NOT NULL DEFAULT 0,
  total_tasks int NOT NULL DEFAULT 0,
  tier text,
  display_label text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.journey_phase_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jpd_read_authenticated ON public.journey_phase_definitions;
CREATE POLICY jpd_read_authenticated ON public.journey_phase_definitions
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.fn_recompute_phase_definitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.journey_phase_definitions(phase, required_tasks, total_tasks, updated_at)
  SELECT
    lc.phase,
    count(*) FILTER (WHERE lc.required AND COALESCE(lc.active, true)),
    count(*) FILTER (WHERE COALESCE(lc.active, true)),
    now()
  FROM public.lesson_catalog lc
  WHERE lc.phase IS NOT NULL
  GROUP BY lc.phase
  ON CONFLICT (phase) DO UPDATE
    SET required_tasks = EXCLUDED.required_tasks,
        total_tasks = EXCLUDED.total_tasks,
        updated_at = EXCLUDED.updated_at;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_catalog_phase_recompute ON public.lesson_catalog;
CREATE TRIGGER trg_lesson_catalog_phase_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.lesson_catalog
  FOR EACH STATEMENT EXECUTE FUNCTION public.fn_recompute_phase_definitions();

-- Initial seed (direct INSERT)
INSERT INTO public.journey_phase_definitions(phase, required_tasks, total_tasks, updated_at)
SELECT
  lc.phase,
  count(*) FILTER (WHERE lc.required AND COALESCE(lc.active, true)),
  count(*) FILTER (WHERE COALESCE(lc.active, true)),
  now()
FROM public.lesson_catalog lc
WHERE lc.phase IS NOT NULL
GROUP BY lc.phase
ON CONFLICT (phase) DO UPDATE
  SET required_tasks = EXCLUDED.required_tasks,
      total_tasks = EXCLUDED.total_tasks,
      updated_at = EXCLUDED.updated_at;

-- Course completion trigger
CREATE OR REPLACE FUNCTION public.fn_evaluate_course_completion_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_key text;
  v_required int;
  v_done int;
  v_completion_id uuid;
BEGIN
  IF NEW.completed IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT lc.course_key INTO v_course_key
    FROM public.lesson_catalog lc WHERE lc.lesson_id = NEW.task_id;
  IF v_course_key IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_required
    FROM public.lesson_catalog
    WHERE course_key = v_course_key AND required AND COALESCE(active, true);
  IF v_required = 0 THEN RETURN NEW; END IF;

  SELECT count(DISTINCT jp.task_id) INTO v_done
    FROM public.journey_progress jp
    JOIN public.lesson_catalog lc ON lc.lesson_id = jp.task_id
    WHERE jp.user_id = NEW.user_id
      AND lc.course_key = v_course_key
      AND lc.required AND COALESCE(lc.active, true)
      AND jp.completed = true;
  IF v_done < v_required THEN RETURN NEW; END IF;

  INSERT INTO public.course_completions(user_id, course_key, completed_at)
  VALUES (NEW.user_id, v_course_key, now())
  ON CONFLICT (user_id, course_key) DO NOTHING
  RETURNING id INTO v_completion_id;

  IF v_completion_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.badges_awarded(user_id, badge_code, source, source_id, awarded_at)
  VALUES (NEW.user_id, 'course_completed:' || v_course_key, 'course_completion', v_completion_id::text, now())
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journey_progress_complete ON public.journey_progress;
CREATE TRIGGER trg_journey_progress_complete
  AFTER INSERT OR UPDATE OF completed ON public.journey_progress
  FOR EACH ROW EXECUTE FUNCTION public.fn_evaluate_course_completion_trg();

-- General application submission trigger
CREATE OR REPLACE FUNCTION public.fn_emit_application_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_submitted_at timestamptz;
  v_sub_id uuid;
BEGIN
  v_user := NEW.user_id;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  v_submitted_at := COALESCE(
    NULLIF(to_jsonb(NEW) ->> 'submitted_at', '')::timestamptz,
    CASE WHEN (to_jsonb(NEW) ->> 'status') IN ('submitted','completed') THEN now() END
  );
  IF v_submitted_at IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.general_application_submissions(user_id, submitted_at)
  VALUES (v_user, v_submitted_at)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.badges_awarded(user_id, badge_code, source, source_id, awarded_at)
  VALUES (v_user, 'application_submitted', 'general_application', v_sub_id::text, now())
  ON CONFLICT (user_id, badge_code, source_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_general_app_submitted ON public.general_applications;
CREATE TRIGGER trg_general_app_submitted
  AFTER INSERT OR UPDATE ON public.general_applications
  FOR EACH ROW EXECUTE FUNCTION public.fn_emit_application_badge();

CREATE INDEX IF NOT EXISTS idx_journey_progress_task_completed ON public.journey_progress (task_id, completed);
CREATE INDEX IF NOT EXISTS idx_course_completions_user ON public.course_completions (user_id);
CREATE INDEX IF NOT EXISTS idx_badges_awarded_user_code ON public.badges_awarded (user_id, badge_code);

REVOKE INSERT, UPDATE, DELETE ON public.course_completions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.general_application_submissions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.badges_awarded FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.network_stats_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.journey_phase_definitions FROM anon, authenticated;
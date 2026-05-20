-- Parity reconciliation: verifies course completions == course_completed badges,
-- general apps == application_submitted badges, snapshot total == sum of per-course stats.
-- Returns a jsonb report and writes any mismatches to stats_drift_log.

CREATE TABLE IF NOT EXISTS public.stats_drift_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at timestamptz NOT NULL DEFAULT now(),
  check_name text NOT NULL,
  expected bigint NOT NULL,
  actual bigint NOT NULL,
  delta bigint GENERATED ALWAYS AS (actual - expected) STORED,
  details jsonb,
  auto_recomputed boolean NOT NULL DEFAULT false
);

ALTER TABLE public.stats_drift_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read drift log" ON public.stats_drift_log;
CREATE POLICY "Admins read drift log" ON public.stats_drift_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_stats_drift_log_detected_at
  ON public.stats_drift_log (detected_at DESC);

CREATE OR REPLACE FUNCTION public.reconcile_course_badge_parity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_course_completions bigint;
  v_course_badges bigint;
  v_app_submissions bigint;
  v_app_badges bigint;
  v_per_course_sum bigint;
  v_snapshot_total bigint;
  v_drift_count int := 0;
  v_report jsonb;
BEGIN
  SELECT count(*) INTO v_course_completions FROM public.course_completions;
  SELECT count(*) INTO v_course_badges
    FROM public.badges_awarded WHERE badge_code LIKE 'course_completed:%';
  SELECT count(*) INTO v_app_submissions FROM public.general_application_submissions;
  SELECT count(*) INTO v_app_badges
    FROM public.badges_awarded WHERE badge_code = 'application_submitted';
  SELECT COALESCE(sum(total_completions), 0) INTO v_per_course_sum
    FROM public.course_completion_stats;
  SELECT COALESCE(value, 0) INTO v_snapshot_total
    FROM public.network_stats_snapshots
    WHERE scope = 'all_time' AND metric_key = 'core_course_completions_total';

  IF v_course_completions <> v_course_badges THEN
    INSERT INTO public.stats_drift_log (check_name, expected, actual)
    VALUES ('course_completions_vs_badges', v_course_completions, v_course_badges);
    v_drift_count := v_drift_count + 1;
  END IF;

  IF v_app_submissions <> v_app_badges THEN
    INSERT INTO public.stats_drift_log (check_name, expected, actual)
    VALUES ('app_submissions_vs_badges', v_app_submissions, v_app_badges);
    v_drift_count := v_drift_count + 1;
  END IF;

  IF v_per_course_sum <> v_snapshot_total THEN
    INSERT INTO public.stats_drift_log (check_name, expected, actual)
    VALUES ('per_course_sum_vs_snapshot_total', v_per_course_sum, v_snapshot_total);
    v_drift_count := v_drift_count + 1;
  END IF;

  v_report := jsonb_build_object(
    'checked_at', now(),
    'drift_count', v_drift_count,
    'course_completions', v_course_completions,
    'course_badges', v_course_badges,
    'app_submissions', v_app_submissions,
    'app_badges', v_app_badges,
    'per_course_sum', v_per_course_sum,
    'snapshot_total', v_snapshot_total
  );

  IF v_drift_count > 0 THEN
    PERFORM public.recompute_all_stats();
    UPDATE public.stats_drift_log
      SET auto_recomputed = true
      WHERE detected_at >= now() - interval '1 minute';
    v_report := v_report || jsonb_build_object('auto_recomputed', true);
  END IF;

  RETURN v_report;
END $$;

REVOKE EXECUTE ON FUNCTION public.reconcile_course_badge_parity() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_reconcile_parity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.reconcile_course_badge_parity();
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_reconcile_parity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reconcile_parity() TO authenticated;
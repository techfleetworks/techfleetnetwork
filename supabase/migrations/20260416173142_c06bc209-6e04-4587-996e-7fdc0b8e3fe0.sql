CREATE OR REPLACE FUNCTION public.get_network_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH
  -- Badge thresholds as a reference table
  thresholds(phase, threshold) AS (
    VALUES
      ('first_steps'::journey_phase, 6),
      ('second_steps'::journey_phase, 25),
      ('discord_learning'::journey_phase, 19),
      ('third_steps'::journey_phase, 12),
      ('project_training'::journey_phase, 14),
      ('volunteer'::journey_phase, 6)
  ),
  -- Beginner course phase thresholds
  beginner_thresholds(phase, threshold) AS (
    VALUES
      ('second_steps'::journey_phase, 25),
      ('discord_learning'::journey_phase, 19)
  ),
  -- Advanced course phase thresholds
  advanced_thresholds(phase, threshold) AS (
    VALUES
      ('third_steps'::journey_phase, 12),
      ('project_training'::journey_phase, 14),
      ('volunteer'::journey_phase, 6),
      ('observer'::journey_phase, 7)
  ),
  -- Single scan: aggregate completed counts per user+phase
  phase_agg AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE completed = true
    GROUP BY user_id, phase
  ),
  -- Previous week boundaries
  pw AS (
    SELECT
      date_trunc('week', now() - interval '1 week') AS pw_start,
      date_trunc('week', now() - interval '1 week') + interval '6 days 23 hours 59 minutes 59 seconds' AS pw_end
  ),
  -- Pre-previous-week counts
  pre_pw_agg AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE completed = true
      AND completed_at < (SELECT pw_start FROM pw)
    GROUP BY user_id, phase
  ),
  -- Users who had activity in the reporting week
  rw_active_users AS (
    SELECT DISTINCT user_id, phase
    FROM public.journey_progress
    WHERE completed = true
      AND completed_at >= (SELECT pw_start FROM pw)
      AND completed_at <= (SELECT pw_end FROM pw)
  ),
  -- Core stats
  signups AS (SELECT count(*) AS total FROM public.profiles),
  core_completed AS (
    SELECT count(*) AS total FROM phase_agg WHERE phase = 'first_steps' AND cnt >= 6
  ),
  beginner_completed AS (
    SELECT count(DISTINCT pa.user_id) AS total
    FROM phase_agg pa
    JOIN beginner_thresholds bt ON pa.phase = bt.phase AND pa.cnt >= bt.threshold
  ),
  advanced_completed AS (
    SELECT count(DISTINCT pa.user_id) AS total
    FROM phase_agg pa
    JOIN advanced_thresholds at2 ON pa.phase = at2.phase AND pa.cnt >= at2.threshold
  ),
  badges_all AS (
    SELECT count(*) AS total
    FROM phase_agg pa
    JOIN thresholds t ON pa.phase = t.phase AND pa.cnt >= t.threshold
  ),
  apps_completed AS (
    SELECT count(*) AS total FROM public.general_applications WHERE status IN ('submitted', 'completed')
  ),
  -- Previous week deltas
  rw_signups AS (
    SELECT count(*) AS total FROM public.profiles
    WHERE created_at >= (SELECT pw_start FROM pw) AND created_at <= (SELECT pw_end FROM pw)
  ),
  rw_core_completed AS (
    SELECT count(*) AS total FROM (
      SELECT pa.user_id
      FROM phase_agg pa
      WHERE pa.phase = 'first_steps' AND pa.cnt >= 6
        AND COALESCE((SELECT cnt FROM pre_pw_agg ppa WHERE ppa.user_id = pa.user_id AND ppa.phase = 'first_steps'), 0) < 6
        AND EXISTS (SELECT 1 FROM rw_active_users rw WHERE rw.user_id = pa.user_id AND rw.phase = 'first_steps')
    ) sub
  ),
  rw_beginner_completed AS (
    SELECT count(*) AS total FROM (
      SELECT DISTINCT pa.user_id
      FROM phase_agg pa
      JOIN beginner_thresholds bt ON pa.phase = bt.phase AND pa.cnt >= bt.threshold
      WHERE COALESCE((SELECT cnt FROM pre_pw_agg ppa WHERE ppa.user_id = pa.user_id AND ppa.phase = pa.phase), 0) < bt.threshold
        AND EXISTS (SELECT 1 FROM rw_active_users rw WHERE rw.user_id = pa.user_id AND rw.phase = pa.phase)
    ) sub
  ),
  rw_advanced_completed AS (
    SELECT count(*) AS total FROM (
      SELECT DISTINCT pa.user_id
      FROM phase_agg pa
      JOIN advanced_thresholds at2 ON pa.phase = at2.phase AND pa.cnt >= at2.threshold
      WHERE COALESCE((SELECT cnt FROM pre_pw_agg ppa WHERE ppa.user_id = pa.user_id AND ppa.phase = pa.phase), 0) < at2.threshold
        AND EXISTS (SELECT 1 FROM rw_active_users rw WHERE rw.user_id = pa.user_id AND rw.phase = pa.phase)
    ) sub
  ),
  rw_badges AS (
    SELECT count(*) AS total FROM (
      SELECT pa.user_id, pa.phase
      FROM phase_agg pa
      JOIN thresholds t ON pa.phase = t.phase AND pa.cnt >= t.threshold
      WHERE COALESCE((SELECT cnt FROM pre_pw_agg ppa WHERE ppa.user_id = pa.user_id AND ppa.phase = pa.phase), 0) < t.threshold
        AND EXISTS (SELECT 1 FROM rw_active_users rw WHERE rw.user_id = pa.user_id AND rw.phase = pa.phase)
    ) sub
  ),
  rw_apps AS (
    SELECT count(*) AS total FROM public.general_applications
    WHERE status IN ('submitted', 'completed')
      AND completed_at >= (SELECT pw_start FROM pw)
      AND completed_at <= (SELECT pw_end FROM pw)
  ),
  project_counts AS (
    SELECT
      count(*) FILTER (WHERE project_status IN ('apply_now','recruiting')) AS open_applications,
      count(*) FILTER (WHERE project_status = 'coming_soon') AS coming_soon,
      count(*) FILTER (WHERE project_status IN ('team_onboarding','project_in_progress')) AS live,
      count(*) FILTER (WHERE project_status = 'project_complete') AS previously_completed
    FROM public.projects
  )
SELECT json_build_object(
  'total_signups', (SELECT total FROM signups),
  'core_courses_active', (SELECT total FROM core_completed),
  'beginner_courses_active', (SELECT total FROM beginner_completed),
  'advanced_courses_active', (SELECT total FROM advanced_completed),
  'applications_completed', (SELECT total FROM apps_completed),
  'badges_earned', (SELECT total FROM badges_all),
  'prev_week_start', (SELECT pw_start FROM pw),
  'prev_week_end', (SELECT pw_end FROM pw),
  'prev_week_signups', (SELECT total FROM rw_signups),
  'prev_week_core_active', (SELECT total FROM rw_core_completed),
  'prev_week_beginner_active', (SELECT total FROM rw_beginner_completed),
  'prev_week_advanced_active', (SELECT total FROM rw_advanced_completed),
  'prev_week_applications', (SELECT total FROM rw_apps),
  'prev_week_badges', (SELECT total FROM rw_badges),
  'projects_open_applications', (SELECT open_applications FROM project_counts),
  'projects_coming_soon', (SELECT coming_soon FROM project_counts),
  'projects_live', (SELECT live FROM project_counts),
  'projects_previously_completed', (SELECT previously_completed FROM project_counts)
)
$function$;
CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH thresholds(phase, threshold) AS (
  VALUES
    ('first_steps'::journey_phase, 6),
    ('second_steps'::journey_phase, 25),
    ('discord_learning'::journey_phase, 19),
    ('third_steps'::journey_phase, 12),
    ('project_training'::journey_phase, 14),
    ('volunteer'::journey_phase, 6)
), beginner_thresholds(phase, threshold) AS (
  VALUES
    ('second_steps'::journey_phase, 25),
    ('discord_learning'::journey_phase, 19)
), advanced_thresholds(phase, threshold) AS (
  VALUES
    ('third_steps'::journey_phase, 12),
    ('project_training'::journey_phase, 14),
    ('volunteer'::journey_phase, 6),
    ('observer'::journey_phase, 7)
), rolling_window AS (
  SELECT
    date_trunc('day', now()) - interval '6 days' AS start_at,
    now() AS end_at,
    (date_trunc('day', now()) - interval '6 days')::date::text AS start_label,
    now()::date::text AS end_label
), phase_agg AS (
  SELECT user_id, phase, count(*) AS cnt
  FROM public.journey_progress
  WHERE completed = true
  GROUP BY user_id, phase
), pre_window_agg AS (
  SELECT user_id, phase, count(*) AS cnt
  FROM public.journey_progress
  WHERE completed = true
    AND completed_at < (SELECT start_at FROM rolling_window)
  GROUP BY user_id, phase
), window_active_users AS (
  SELECT DISTINCT user_id, phase
  FROM public.journey_progress
  WHERE completed = true
    AND completed_at >= (SELECT start_at FROM rolling_window)
    AND completed_at <= (SELECT end_at FROM rolling_window)
), signups AS (
  SELECT count(*) AS total FROM public.profiles
), core_completed AS (
  SELECT count(*) AS total
  FROM phase_agg
  WHERE phase = 'first_steps' AND cnt >= 6
), beginner_completed AS (
  SELECT count(DISTINCT pa.user_id) AS total
  FROM phase_agg pa
  JOIN beginner_thresholds bt ON pa.phase = bt.phase AND pa.cnt >= bt.threshold
), advanced_completed AS (
  SELECT count(DISTINCT pa.user_id) AS total
  FROM phase_agg pa
  JOIN advanced_thresholds at2 ON pa.phase = at2.phase AND pa.cnt >= at2.threshold
), badges_all AS (
  SELECT count(*) AS total
  FROM phase_agg pa
  JOIN thresholds t ON pa.phase = t.phase AND pa.cnt >= t.threshold
), apps_completed AS (
  SELECT count(*) AS total
  FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
), rolling_signups AS (
  SELECT count(*) AS total
  FROM public.profiles
  WHERE created_at >= (SELECT start_at FROM rolling_window)
    AND created_at <= (SELECT end_at FROM rolling_window)
), rolling_core_completed AS (
  SELECT count(*) AS total
  FROM (
    SELECT pa.user_id
    FROM phase_agg pa
    WHERE pa.phase = 'first_steps'
      AND pa.cnt >= 6
      AND COALESCE((SELECT pwa.cnt FROM pre_window_agg pwa WHERE pwa.user_id = pa.user_id AND pwa.phase = 'first_steps'), 0) < 6
      AND EXISTS (
        SELECT 1 FROM window_active_users wau
        WHERE wau.user_id = pa.user_id AND wau.phase = 'first_steps'
      )
  ) sub
), rolling_beginner_completed AS (
  SELECT count(*) AS total
  FROM (
    SELECT DISTINCT pa.user_id
    FROM phase_agg pa
    JOIN beginner_thresholds bt ON pa.phase = bt.phase AND pa.cnt >= bt.threshold
    WHERE COALESCE((SELECT pwa.cnt FROM pre_window_agg pwa WHERE pwa.user_id = pa.user_id AND pwa.phase = pa.phase), 0) < bt.threshold
      AND EXISTS (
        SELECT 1 FROM window_active_users wau
        WHERE wau.user_id = pa.user_id AND wau.phase = pa.phase
      )
  ) sub
), rolling_advanced_completed AS (
  SELECT count(*) AS total
  FROM (
    SELECT DISTINCT pa.user_id
    FROM phase_agg pa
    JOIN advanced_thresholds at2 ON pa.phase = at2.phase AND pa.cnt >= at2.threshold
    WHERE COALESCE((SELECT pwa.cnt FROM pre_window_agg pwa WHERE pwa.user_id = pa.user_id AND pwa.phase = pa.phase), 0) < at2.threshold
      AND EXISTS (
        SELECT 1 FROM window_active_users wau
        WHERE wau.user_id = pa.user_id AND wau.phase = pa.phase
      )
  ) sub
), rolling_badges AS (
  SELECT count(*) AS total
  FROM (
    SELECT pa.user_id, pa.phase
    FROM phase_agg pa
    JOIN thresholds t ON pa.phase = t.phase AND pa.cnt >= t.threshold
    WHERE COALESCE((SELECT pwa.cnt FROM pre_window_agg pwa WHERE pwa.user_id = pa.user_id AND pwa.phase = pa.phase), 0) < t.threshold
      AND EXISTS (
        SELECT 1 FROM window_active_users wau
        WHERE wau.user_id = pa.user_id AND wau.phase = pa.phase
      )
  ) sub
), rolling_apps AS (
  SELECT count(*) AS total
  FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
    AND completed_at >= (SELECT start_at FROM rolling_window)
    AND completed_at <= (SELECT end_at FROM rolling_window)
), project_counts AS (
  SELECT
    count(*) FILTER (WHERE project_status IN ('apply_now', 'recruiting')) AS open_applications,
    count(*) FILTER (WHERE project_status = 'coming_soon') AS coming_soon,
    count(*) FILTER (WHERE project_status IN ('team_onboarding', 'project_in_progress')) AS live,
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
  'prev_week_start', (SELECT start_label FROM rolling_window),
  'prev_week_end', (SELECT end_label FROM rolling_window),
  'prev_week_signups', (SELECT total FROM rolling_signups),
  'prev_week_core_active', (SELECT total FROM rolling_core_completed),
  'prev_week_beginner_active', (SELECT total FROM rolling_beginner_completed),
  'prev_week_advanced_active', (SELECT total FROM rolling_advanced_completed),
  'prev_week_applications', (SELECT total FROM rolling_apps),
  'prev_week_badges', (SELECT total FROM rolling_badges),
  'projects_open_applications', (SELECT open_applications FROM project_counts),
  'projects_coming_soon', (SELECT coming_soon FROM project_counts),
  'projects_live', (SELECT live FROM project_counts),
  'projects_previously_completed', (SELECT previously_completed FROM project_counts)
);
$function$;
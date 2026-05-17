CREATE OR REPLACE FUNCTION public.get_network_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
WITH rolling_window AS (
  SELECT
    date_trunc('day', now()) - interval '6 days' AS start_at,
    now() AS end_at,
    (date_trunc('day', now()) - interval '6 days')::date::text AS start_label,
    now()::date::text AS end_label
),
phase_agg AS (
  SELECT user_id, phase, count(*) AS cnt, max(completed_at) AS last_completed_at
  FROM public.journey_progress
  WHERE completed = true
  GROUP BY user_id, phase
),
phase_agg_pre AS (
  SELECT user_id, phase, count(*) AS cnt
  FROM public.journey_progress
  WHERE completed = true AND completed_at < (SELECT start_at FROM rolling_window)
  GROUP BY user_id, phase
),
phase_required(phase, required) AS (
  VALUES
    ('first_steps'::public.journey_phase,      7),
    ('second_steps'::public.journey_phase,     25),
    ('project_training'::public.journey_phase, 14),
    ('volunteer'::public.journey_phase,        6),
    ('discord_learning'::public.journey_phase, 19),
    ('observer'::public.journey_phase,         7),
    ('third_steps'::public.journey_phase,      12)
),
course_completions AS (
  SELECT pa.user_id, pa.phase, pa.last_completed_at
  FROM phase_agg pa
  JOIN phase_required pr ON pr.phase = pa.phase
  WHERE pa.cnt >= pr.required
),
signups AS (SELECT count(*) AS total FROM public.profiles),
core_completed AS (SELECT count(*) AS total FROM course_completions),
apps_completed AS (
  SELECT count(*) AS total FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
),
rolling_signups AS (
  SELECT count(*) AS total FROM public.profiles
  WHERE created_at >= (SELECT start_at FROM rolling_window)
    AND created_at <= (SELECT end_at FROM rolling_window)
),
rolling_core_completed AS (
  SELECT count(*) AS total
  FROM phase_agg pa
  JOIN phase_required pr ON pr.phase = pa.phase
  WHERE pa.cnt >= pr.required
    AND COALESCE((SELECT pap.cnt FROM phase_agg_pre pap WHERE pap.user_id = pa.user_id AND pap.phase = pa.phase), 0) < pr.required
    AND pa.last_completed_at >= (SELECT start_at FROM rolling_window)
    AND pa.last_completed_at <= (SELECT end_at FROM rolling_window)
),
rolling_apps AS (
  SELECT count(*) AS total FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
    AND completed_at >= (SELECT start_at FROM rolling_window)
    AND completed_at <= (SELECT end_at FROM rolling_window)
),
project_counts AS (
  SELECT
    count(*) FILTER (WHERE project_status = 'apply_now') AS open_applications,
    count(*) FILTER (WHERE project_status IN ('coming_soon', 'recruiting', 'team_onboarding')) AS coming_soon
  FROM public.projects
)
SELECT json_build_object(
  'total_signups', (SELECT total FROM signups),
  'core_courses_active', (SELECT total FROM core_completed),
  -- Beginner courses = unique Service / Servant Leadership Masterclass registrants (Airtable historical).
  'beginner_courses_active', 1101,
  -- Advanced courses = 1881 total masterclass registrations - 1101 Service/Servant Leadership unique registrants.
  'advanced_courses_active', 780,
  -- General applications = platform-submitted apps + 890 (historical Airtable baseline).
  'applications_completed', (SELECT total FROM apps_completed) + 890,
  'badges_earned', (SELECT total FROM core_completed) + (SELECT total FROM apps_completed) + 890,
  'prev_week_start', (SELECT start_label FROM rolling_window),
  'prev_week_end', (SELECT end_label FROM rolling_window),
  'prev_week_signups', (SELECT total FROM rolling_signups),
  'prev_week_core_active', (SELECT total FROM rolling_core_completed),
  'prev_week_beginner_active', 0,
  'prev_week_advanced_active', 0,
  'prev_week_applications', (SELECT total FROM rolling_apps),
  'prev_week_badges', (SELECT total FROM rolling_core_completed) + (SELECT total FROM rolling_apps),
  'projects_open_applications', (SELECT open_applications FROM project_counts),
  'projects_coming_soon', (SELECT coming_soon FROM project_counts),
  'projects_live', 11,
  'projects_previously_completed', 120
);
$function$;
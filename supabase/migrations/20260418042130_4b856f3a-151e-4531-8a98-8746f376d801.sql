CREATE OR REPLACE FUNCTION public.get_network_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH rolling_window AS (
  SELECT
    date_trunc('day', now()) - interval '6 days' AS start_at,
    now() AS end_at,
    (date_trunc('day', now()) - interval '6 days')::date::text AS start_label,
    now()::date::text AS end_label
), first_steps_agg AS (
  -- "Onboard to Tech Fleet" tab = Connect to Discord (1 task) + Onboarding Steps (6 tasks)
  -- All stored under journey_phase = 'first_steps'. Total required = 7 tasks.
  SELECT user_id, count(*) AS cnt, max(completed_at) AS last_completed_at
  FROM public.journey_progress
  WHERE completed = true AND phase = 'first_steps'
  GROUP BY user_id
), first_steps_pre_window AS (
  SELECT user_id, count(*) AS cnt
  FROM public.journey_progress
  WHERE completed = true
    AND phase = 'first_steps'
    AND completed_at < (SELECT start_at FROM rolling_window)
  GROUP BY user_id
), signups AS (
  SELECT count(*) AS total FROM public.profiles
), core_completed AS (
  -- Core = "Onboard to Tech Fleet" tab fully complete (all 7 first_steps tasks)
  SELECT count(*) AS total
  FROM first_steps_agg
  WHERE cnt >= 7
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
  -- Newly completed Core in the last 7 days: now >=7, was <7 before window started
  SELECT count(*) AS total
  FROM first_steps_agg fsa
  WHERE fsa.cnt >= 7
    AND COALESCE(
      (SELECT pre.cnt FROM first_steps_pre_window pre WHERE pre.user_id = fsa.user_id),
      0
    ) < 7
    AND fsa.last_completed_at >= (SELECT start_at FROM rolling_window)
    AND fsa.last_completed_at <= (SELECT end_at FROM rolling_window)
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
  -- Beginner Courses tab is currently empty in the UI -> always 0
  'beginner_courses_active', 0,
  -- Advanced Courses tab is currently empty in the UI -> always 0
  'advanced_courses_active', 0,
  'applications_completed', (SELECT total FROM apps_completed),
  -- Badges metric mirrors Core completion until other category badges are introduced
  'badges_earned', (SELECT total FROM core_completed),
  'prev_week_start', (SELECT start_label FROM rolling_window),
  'prev_week_end', (SELECT end_label FROM rolling_window),
  'prev_week_signups', (SELECT total FROM rolling_signups),
  'prev_week_core_active', (SELECT total FROM rolling_core_completed),
  'prev_week_beginner_active', 0,
  'prev_week_advanced_active', 0,
  'prev_week_applications', (SELECT total FROM rolling_apps),
  'prev_week_badges', (SELECT total FROM rolling_core_completed),
  'projects_open_applications', (SELECT open_applications FROM project_counts),
  'projects_coming_soon', (SELECT coming_soon FROM project_counts),
  'projects_live', (SELECT live FROM project_counts),
  'projects_previously_completed', (SELECT previously_completed FROM project_counts)
);
$function$;
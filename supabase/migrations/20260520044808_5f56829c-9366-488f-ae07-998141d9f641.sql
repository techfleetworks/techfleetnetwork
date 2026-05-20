CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH s AS (SELECT metric_key, value FROM public.network_stats_snapshots WHERE scope = 'all_time'),
pw AS (SELECT metric_key, value FROM public.network_stats_snapshots WHERE scope = 'past_7d'),
o  AS (SELECT metric_key, value FROM public.network_stats_overrides),
h  AS (SELECT metric_key, value, last_synced_at FROM public.network_stats_historical),
proj AS (
  SELECT
    count(*) FILTER (WHERE LOWER(project_status::text) = 'apply_now') AS open_apps,
    count(*) FILTER (WHERE LOWER(project_status::text) IN ('coming_soon','recruiting','team_onboarding')) AS coming_soon
  FROM public.projects
),
dcc AS (
  SELECT count(DISTINCT cc.user_id) AS n
  FROM public.course_completions cc
  JOIN public.profiles p ON p.id = cc.user_id
  WHERE COALESCE(p.is_test_account, false) = false
)
SELECT jsonb_build_object(
  'total_signups',                 COALESCE((SELECT value FROM s WHERE metric_key='total_signups'), 0),
  'core_courses_active',           COALESCE((SELECT value FROM s WHERE metric_key='core_course_completions_total'), 0),
  'distinct_course_completers',    COALESCE((SELECT n FROM dcc), 0),
  'beginner_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='beginner_courses_active'), 0),
  'advanced_courses_active',       COALESCE((SELECT value FROM o WHERE metric_key='advanced_courses_active'), 0),
  'applications_completed',        COALESCE((SELECT value FROM s WHERE metric_key='general_applications_total'), 0),
  'badges_earned',                 COALESCE((SELECT value FROM s WHERE metric_key='badges_earned_total'), 0),
  'prev_week_start',               to_char((current_date - interval '7 days')::date, 'YYYY-MM-DD'),
  'prev_week_end',                 to_char(current_date, 'YYYY-MM-DD'),
  'prev_week_signups',             COALESCE((SELECT value FROM pw WHERE metric_key='total_signups'), 0),
  'prev_week_core_active',         COALESCE((SELECT value FROM pw WHERE metric_key='core_course_completions_total'), 0),
  'prev_week_beginner_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_beginner_active'), 0),
  'prev_week_advanced_active',     COALESCE((SELECT value FROM o WHERE metric_key='prev_week_advanced_active'), 0),
  'prev_week_applications',        COALESCE((SELECT value FROM pw WHERE metric_key='general_applications_total'), 0),
  'prev_week_badges',              COALESCE((SELECT value FROM pw WHERE metric_key='badges_earned_total'), 0),
  'projects_open_applications',    (SELECT open_apps FROM proj),
  'projects_coming_soon',          (SELECT coming_soon FROM proj),
  'projects_live',                 COALESCE((SELECT value FROM o WHERE metric_key='projects_live'), 0),
  'projects_previously_completed', COALESCE((SELECT value FROM o WHERE metric_key='projects_previously_completed'), 0),
  'historical', jsonb_build_object(
    'general_applications_pre_platform', COALESCE((SELECT value FROM h WHERE metric_key='general_applications_pre_platform'), 0),
    'service_leadership_unique',         COALESCE((SELECT value FROM h WHERE metric_key='service_leadership_unique'), 0),
    'masterclass_total',                 COALESCE((SELECT value FROM h WHERE metric_key='masterclass_total'), 0),
    'masterclass_minus_servlead',        COALESCE((SELECT value FROM h WHERE metric_key='masterclass_minus_servlead'), 0),
    'last_synced_at',                    (SELECT max(last_synced_at) FROM h)
  )
);
$$;
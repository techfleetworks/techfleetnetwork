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
),
phase_agg AS (
  SELECT
    user_id,
    phase,
    count(*) AS cnt,
    max(completed_at) AS last_completed_at
  FROM public.journey_progress
  WHERE completed = true
  GROUP BY user_id, phase
),
phase_agg_pre AS (
  SELECT
    user_id,
    phase,
    count(*) AS cnt
  FROM public.journey_progress
  WHERE completed = true
    AND completed_at < (SELECT start_at FROM rolling_window)
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
signups AS (
  SELECT count(*) AS total FROM public.profiles
),
core_completed AS (
  SELECT count(*) AS total FROM course_completions
),
apps_completed AS (
  SELECT count(*) AS total
  FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
),
rolling_signups AS (
  SELECT count(*) AS total
  FROM public.profiles
  WHERE created_at >= (SELECT start_at FROM rolling_window)
    AND created_at <= (SELECT end_at FROM rolling_window)
),
rolling_core_completed AS (
  SELECT count(*) AS total
  FROM phase_agg pa
  JOIN phase_required pr ON pr.phase = pa.phase
  WHERE pa.cnt >= pr.required
    AND COALESCE(
      (SELECT pap.cnt
       FROM phase_agg_pre pap
       WHERE pap.user_id = pa.user_id AND pap.phase = pa.phase),
      0
    ) < pr.required
    AND pa.last_completed_at >= (SELECT start_at FROM rolling_window)
    AND pa.last_completed_at <= (SELECT end_at FROM rolling_window)
),
rolling_apps AS (
  SELECT count(*) AS total
  FROM public.general_applications
  WHERE status IN ('submitted', 'completed')
    AND completed_at >= (SELECT start_at FROM rolling_window)
    AND completed_at <= (SELECT end_at FROM rolling_window)
),
project_counts AS (
  SELECT
    count(*) FILTER (WHERE project_status IN ('apply_now', 'recruiting')) AS open_applications,
    count(*) FILTER (WHERE project_status = 'coming_soon') AS coming_soon
  FROM public.projects
)
SELECT json_build_object(
  'total_signups', (SELECT total FROM signups),
  'core_courses_active', (SELECT total FROM core_completed),
  'beginner_courses_active', 0,
  'advanced_courses_active', 0,
  'applications_completed', (SELECT total FROM apps_completed),
  'badges_earned', (SELECT total FROM core_completed) + (SELECT total FROM apps_completed),
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

GRANT EXECUTE ON FUNCTION public.get_network_stats() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_network_stats() FROM PUBLIC, anon;

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'NET-ACT-LIVE-011',
  'Network Activity',
  96,
  'Network Activity shows fixed Live Projects count',
  'Feature: Network Activity project training counts\n  Scenario: Live Projects uses the approved fixed value\n    Given Network Activity requests aggregate project training stats\n    When the Live Projects card is displayed\n    Then the Live Projects value is 11\n    And open applications, coming soon, and previously completed values continue to load from their configured sources',
  'implemented',
  'unit',
  'src/test/ui/NetworkActivity.test.tsx',
  'Business-approved fixed value for Live Projects on Network Activity.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
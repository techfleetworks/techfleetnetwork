CREATE OR REPLACE FUNCTION public.get_network_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
WITH
  signups AS (
    SELECT count(*) AS total FROM public.profiles
  ),
  phase_counts AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE completed = true
    GROUP BY user_id, phase
  ),
  core_completed AS (
    SELECT count(*) AS total FROM phase_counts
    WHERE phase = 'first_steps' AND cnt >= 6
  ),
  badges_all AS (
    SELECT count(*) AS total FROM phase_counts
    WHERE (phase = 'first_steps' AND cnt >= 6)
       OR (phase = 'second_steps' AND cnt >= 25)
       OR (phase = 'discord_learning' AND cnt >= 19)
       OR (phase = 'third_steps' AND cnt >= 12)
       OR (phase = 'project_training' AND cnt >= 14)
       OR (phase = 'volunteer' AND cnt >= 6)
  ),
  apps_completed AS (
    SELECT count(*) AS total FROM public.general_applications
    WHERE status = 'submitted'
  ),
  prev_week AS (
    SELECT
      date_trunc('week', now() - interval '1 week') AS pw_start,
      date_trunc('week', now() - interval '1 week') + interval '6 days 23 hours 59 minutes 59 seconds' AS pw_end
  ),
  rw_progress AS (
    SELECT user_id, phase
    FROM public.journey_progress
    WHERE completed = true
      AND completed_at >= (SELECT pw_start FROM prev_week)
      AND completed_at <= (SELECT pw_end FROM prev_week)
  ),
  pre_rw_counts AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE completed = true
      AND completed_at < (SELECT pw_start FROM prev_week)
    GROUP BY user_id, phase
  ),
  rw_signups AS (
    SELECT count(*) AS total FROM public.profiles
    WHERE created_at >= (SELECT pw_start FROM prev_week)
      AND created_at <= (SELECT pw_end FROM prev_week)
  ),
  rw_core_completed AS (
    SELECT count(*) AS total FROM (
      SELECT pc.user_id FROM phase_counts pc
      WHERE pc.phase = 'first_steps' AND pc.cnt >= 6
        AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'first_steps'), 0) < 6
        AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'first_steps')
    ) sub
  ),
  rw_badges AS (
    SELECT count(*) AS total FROM (
      SELECT pc.user_id, pc.phase FROM phase_counts pc
      WHERE (pc.phase = 'first_steps' AND pc.cnt >= 6
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'first_steps'), 0) < 6
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'first_steps'))
         OR (pc.phase = 'second_steps' AND pc.cnt >= 25
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'second_steps'), 0) < 25
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'second_steps'))
         OR (pc.phase = 'discord_learning' AND pc.cnt >= 19
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'discord_learning'), 0) < 19
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'discord_learning'))
         OR (pc.phase = 'third_steps' AND pc.cnt >= 12
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'third_steps'), 0) < 12
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'third_steps'))
         OR (pc.phase = 'project_training' AND pc.cnt >= 14
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'project_training'), 0) < 14
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'project_training'))
         OR (pc.phase = 'volunteer' AND pc.cnt >= 6
             AND COALESCE((SELECT ppc.cnt FROM pre_rw_counts ppc WHERE ppc.user_id = pc.user_id AND ppc.phase = 'volunteer'), 0) < 6
             AND EXISTS (SELECT 1 FROM rw_progress rw WHERE rw.user_id = pc.user_id AND rw.phase = 'volunteer'))
    ) sub
  ),
  rw_apps AS (
    SELECT count(*) AS total FROM public.general_applications
    WHERE status = 'submitted'
      AND completed_at >= (SELECT pw_start FROM prev_week)
      AND completed_at <= (SELECT pw_end FROM prev_week)
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
  'beginner_courses_active', 0,
  'advanced_courses_active', 0,
  'applications_completed', (SELECT total FROM apps_completed),
  'badges_earned', (SELECT total FROM badges_all),
  'prev_week_start', (SELECT pw_start FROM prev_week),
  'prev_week_end', (SELECT pw_end FROM prev_week),
  'prev_week_signups', (SELECT total FROM rw_signups),
  'prev_week_core_active', (SELECT total FROM rw_core_completed),
  'prev_week_beginner_active', 0,
  'prev_week_advanced_active', 0,
  'prev_week_applications', (SELECT total FROM rw_apps),
  'prev_week_badges', (SELECT total FROM rw_badges),
  'projects_open_applications', (SELECT open_applications FROM project_counts),
  'projects_coming_soon', (SELECT coming_soon FROM project_counts),
  'projects_live', (SELECT live FROM project_counts),
  'projects_previously_completed', (SELECT previously_completed FROM project_counts)
)
$$;
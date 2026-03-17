
CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS json
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH prev_week AS (
    SELECT
      date_trunc('week', now() - interval '1 week')::date AS ws,
      (date_trunc('week', now()) - interval '1 day')::date AS we
  ),
  phase_counts AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM public.journey_progress
    WHERE completed = true
    GROUP BY user_id, phase
  ),
  core_active_users AS (
    SELECT DISTINCT user_id FROM phase_counts
    WHERE (phase = 'first_steps' AND cnt < 6)
       OR (phase = 'second_steps' AND cnt < 25)
       OR (phase = 'third_steps')
  ),
  badges_all AS (
    SELECT count(*) AS total FROM phase_counts
    WHERE (phase = 'first_steps' AND cnt >= 6)
       OR (phase = 'second_steps' AND cnt >= 25)
  ),
  pw_progress AS (
    SELECT jp.user_id, jp.phase
    FROM public.journey_progress jp, prev_week
    WHERE jp.completed = true
      AND jp.completed_at >= prev_week.ws::timestamp with time zone
      AND jp.completed_at < (prev_week.we + 1)::timestamp with time zone
  ),
  pw_phase_counts AS (
    SELECT user_id, phase, count(*) AS cnt
    FROM pw_progress
    GROUP BY user_id, phase
  )
  SELECT json_build_object(
    'total_signups', (SELECT count(*) FROM public.profiles),
    'core_courses_active', (SELECT count(*) FROM core_active_users),
    'beginner_courses_active', 0,
    'advanced_courses_active', 0,
    'applications_completed', 0,
    'badges_earned', (SELECT total FROM badges_all),
    'prev_week_start', (SELECT ws::text FROM prev_week),
    'prev_week_end', (SELECT we::text FROM prev_week),
    'prev_week_signups', (
      SELECT count(*) FROM public.profiles, prev_week
      WHERE created_at >= prev_week.ws::timestamp with time zone
        AND created_at < (prev_week.we + 1)::timestamp with time zone
    ),
    'prev_week_core_active', (
      SELECT count(DISTINCT user_id) FROM pw_progress
      WHERE phase IN ('first_steps','second_steps','third_steps')
    ),
    'prev_week_beginner_active', 0,
    'prev_week_advanced_active', 0,
    'prev_week_applications', 0,
    'prev_week_badges', (
      SELECT count(*) FROM pw_phase_counts
      WHERE (phase = 'first_steps' AND cnt >= 6)
         OR (phase = 'second_steps' AND cnt >= 25)
    )
  );
$$;


CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_members', (SELECT count(*) FROM public.profiles),
    'first_steps_active', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'first_steps' AND jp.completed = false
    ),
    'first_steps_completed', (
      SELECT count(DISTINCT sub.user_id)
      FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'first_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) >= 4
      ) sub
    ),
    'second_steps_active', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'second_steps' AND jp.completed = false
    ),
    'second_steps_completed', (
      SELECT count(DISTINCT sub.user_id)
      FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'second_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) >= 1
      ) sub
    ),
    'third_steps_active', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'third_steps' AND jp.completed = false
    ),
    'third_steps_completed', (
      SELECT count(DISTINCT sub.user_id)
      FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'third_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) >= 1
      ) sub
    ),
    'new_members_7d', (
      SELECT count(*) FROM public.profiles
      WHERE created_at >= now() - interval '7 days'
    ),
    'first_steps_active_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'first_steps' AND jp.completed = false
        AND jp.updated_at >= now() - interval '7 days'
    ),
    'first_steps_completed_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'first_steps' AND jp.completed = true
        AND jp.completed_at >= now() - interval '7 days'
    ),
    'second_steps_active_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'second_steps' AND jp.completed = false
        AND jp.updated_at >= now() - interval '7 days'
    ),
    'second_steps_completed_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'second_steps' AND jp.completed = true
        AND jp.completed_at >= now() - interval '7 days'
    ),
    'third_steps_active_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'third_steps' AND jp.completed = false
        AND jp.updated_at >= now() - interval '7 days'
    ),
    'third_steps_completed_7d', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'third_steps' AND jp.completed = true
        AND jp.completed_at >= now() - interval '7 days'
    )
  );
$$;

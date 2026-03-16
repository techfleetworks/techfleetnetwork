CREATE OR REPLACE FUNCTION public.get_network_stats()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'total_members', (SELECT count(*) FROM public.profiles),

    -- FIRST STEPS: completed = user has all 6 tasks done
    'first_steps_active', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'first_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) < 6
      ) sub
    ),
    'first_steps_completed', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'first_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) >= 6
      ) sub
    ),

    -- SECOND STEPS: completed = user has all 25 lessons done
    'second_steps_active', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'second_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) < 25
      ) sub
    ),
    'second_steps_completed', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'second_steps' AND jp.completed = true
        GROUP BY jp.user_id
        HAVING count(*) >= 25
      ) sub
    ),

    -- THIRD STEPS: placeholder - require at least 1 task completed to be "active", all tasks for "completed"
    -- For now third steps isn't built out, so keep simple counts
    'third_steps_active', (
      SELECT count(DISTINCT jp.user_id)
      FROM public.journey_progress jp
      WHERE jp.phase = 'third_steps' AND jp.completed = true
      AND jp.user_id NOT IN (
        SELECT jp2.user_id FROM public.journey_progress jp2
        WHERE jp2.phase = 'third_steps' AND jp2.completed = false
        GROUP BY jp2.user_id
      )
    ),
    'third_steps_completed', 0,

    'new_members_7d', (
      SELECT count(*) FROM public.profiles
      WHERE created_at >= now() - interval '7 days'
    ),

    -- 7-day variants with same logic
    'first_steps_active_7d', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'first_steps' AND jp.completed = true
          AND jp.completed_at >= now() - interval '7 days'
        GROUP BY jp.user_id
        HAVING count(*) < 6
      ) sub
    ),
    'first_steps_completed_7d', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'first_steps' AND jp.completed = true
          AND jp.completed_at >= now() - interval '7 days'
        GROUP BY jp.user_id
        HAVING count(*) >= 6
      ) sub
    ),
    'second_steps_active_7d', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'second_steps' AND jp.completed = true
          AND jp.completed_at >= now() - interval '7 days'
        GROUP BY jp.user_id
        HAVING count(*) < 25
      ) sub
    ),
    'second_steps_completed_7d', (
      SELECT count(*) FROM (
        SELECT jp.user_id
        FROM public.journey_progress jp
        WHERE jp.phase = 'second_steps' AND jp.completed = true
          AND jp.completed_at >= now() - interval '7 days'
        GROUP BY jp.user_id
        HAVING count(*) >= 25
      ) sub
    ),
    'third_steps_active_7d', 0,
    'third_steps_completed_7d', 0
  );
$$;
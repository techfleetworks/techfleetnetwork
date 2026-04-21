INSERT INTO public.journey_progress (user_id, phase, task_id, completed, completed_at)
SELECT p.user_id, 'first_steps'::journey_phase, 'connect-discord', true, COALESCE(p.discord_invite_created_at, now())
FROM public.profiles p
WHERE p.discord_user_id <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.journey_progress jp
    WHERE jp.user_id = p.user_id AND jp.phase='first_steps' AND jp.task_id='connect-discord'
  )
ON CONFLICT (user_id, phase, task_id) DO UPDATE SET completed = true, completed_at = COALESCE(public.journey_progress.completed_at, EXCLUDED.completed_at);
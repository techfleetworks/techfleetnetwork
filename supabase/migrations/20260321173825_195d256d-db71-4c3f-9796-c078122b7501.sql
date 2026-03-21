
-- Reset any stale rate-limit cooldown
UPDATE public.email_send_state SET retry_after_until = NULL WHERE id = 1;

-- Flip the coming_soon project to apply_now to trigger notifications
UPDATE public.projects
SET project_status = 'apply_now', updated_at = now()
WHERE id = '922ebdcd-3745-4c02-bed8-018325b23743'
  AND project_status = 'coming_soon';

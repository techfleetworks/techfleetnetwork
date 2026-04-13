
-- Add last_nudged_at to track when we last sent a re-engagement nudge
ALTER TABLE public.user_quest_selections
ADD COLUMN last_nudged_at timestamp with time zone DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.user_quest_selections.last_nudged_at IS 'Timestamp of the last re-engagement nudge sent to the user for this quest';


-- Add new profile fields for general application Section 2
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portfolio_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS linkedin_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS experience_areas text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS professional_goals text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notify_training_opportunities boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS education_background text[] NOT NULL DEFAULT '{}';

-- Add new general_applications fields for all sections
ALTER TABLE public.general_applications
  ADD COLUMN IF NOT EXISTS hours_commitment text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS portfolio_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS linkedin_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_engagement text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS previous_engagement_ways text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS teammate_learnings text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS agile_vs_waterfall text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS psychological_safety text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS agile_philosophies text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS collaboration_challenges text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS servant_leadership_definition text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS servant_leadership_actions text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS servant_leadership_challenges text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS servant_leadership_situation text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_section integer NOT NULL DEFAULT 1;

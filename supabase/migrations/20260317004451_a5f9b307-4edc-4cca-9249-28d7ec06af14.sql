-- Add new journey phases for project training and volunteer teams
ALTER TYPE public.journey_phase ADD VALUE IF NOT EXISTS 'project_training';
ALTER TYPE public.journey_phase ADD VALUE IF NOT EXISTS 'volunteer';
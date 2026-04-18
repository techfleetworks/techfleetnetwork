ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS friendly_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- Enforce reasonable length limits at the DB layer (defense in depth)
ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_friendly_name_length;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_friendly_name_length CHECK (char_length(friendly_name) <= 200);

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_description_length;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_description_length CHECK (char_length(description) <= 5000);
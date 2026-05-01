ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS requires_interview boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.projects.requires_interview IS
  'When false, applicants are selected directly without scheduling interviews. Hides interview statuses from admin dropdown and removes scheduling UI/emails for this project.';
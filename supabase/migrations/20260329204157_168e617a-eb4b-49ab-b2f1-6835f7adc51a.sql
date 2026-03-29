ALTER TABLE public.projects ADD COLUMN coordinator_id uuid DEFAULT NULL;

COMMENT ON COLUMN public.projects.coordinator_id IS 'UUID of the admin user who is the project coordinator';
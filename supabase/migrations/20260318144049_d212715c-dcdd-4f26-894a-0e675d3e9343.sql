
ALTER TABLE public.projects
  ADD COLUMN timezone_range text NOT NULL DEFAULT '',
  ADD COLUMN anticipated_start_date date,
  ADD COLUMN anticipated_end_date date,
  ADD COLUMN client_intake_url text NOT NULL DEFAULT '',
  ADD COLUMN notion_repository_url text NOT NULL DEFAULT '';

ALTER TABLE public.projects
  ADD COLUMN discord_role_id text NOT NULL DEFAULT '',
  ADD COLUMN discord_role_name text NOT NULL DEFAULT '';
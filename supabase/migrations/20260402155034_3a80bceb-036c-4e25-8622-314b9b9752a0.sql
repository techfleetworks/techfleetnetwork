-- Update column default to all widgets
ALTER TABLE public.dashboard_preferences
  ALTER COLUMN visible_widgets
  SET DEFAULT '["core_courses", "world_map", "network_activity", "latest_updates", "my_project_apps", "badges"]'::jsonb;

-- Update existing users who have the old limited default
UPDATE public.dashboard_preferences
SET visible_widgets = '["core_courses", "world_map", "network_activity", "latest_updates", "my_project_apps", "badges"]'::jsonb
WHERE visible_widgets = '["core_courses", "latest_updates"]'::jsonb;
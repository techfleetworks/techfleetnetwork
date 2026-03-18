ALTER TABLE public.dashboard_preferences
ADD COLUMN widget_order jsonb NOT NULL DEFAULT '["core_courses","world_map","network_activity","latest_updates","my_project_apps","badges"]'::jsonb;
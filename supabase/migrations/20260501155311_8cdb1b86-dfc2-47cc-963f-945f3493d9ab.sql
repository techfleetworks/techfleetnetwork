-- Enable Realtime broadcasts for the system health state table so admin
-- dashboards can render instant updates instead of polling every 60 seconds.
ALTER TABLE public.system_health_state REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_health_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.system_health_state';
  END IF;
END $$;

-- Same for the remediation registry: when a rule fires or is toggled, push it.
ALTER TABLE public.system_remediations REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'system_remediations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.system_remediations';
  END IF;
END $$;
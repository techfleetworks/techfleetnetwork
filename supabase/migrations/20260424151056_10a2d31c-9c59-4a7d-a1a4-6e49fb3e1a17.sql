-- Enable Realtime for profiles so membership tier updates push instantly to the client.
-- REPLICA IDENTITY FULL ensures the OLD row is included in change payloads,
-- which lets the client compare prev/new tier without an extra fetch.
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;
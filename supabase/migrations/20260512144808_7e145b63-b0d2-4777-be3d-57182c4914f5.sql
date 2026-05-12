-- Drop the broad authenticated-listing policy on announcement-videos
DROP POLICY IF EXISTS "Authenticated users can view announcement videos" ON storage.objects;

-- Tighten anon access on a few helpers that don't actually need pre-auth callers
DO $$
DECLARE
  fname text;
  revoke_anon text[] := ARRAY[
    'open_incident',           -- admin-only UI
    'submit_dispute',          -- always called via edge fn (service role)
    'record_policy_ack',       -- always called via edge fn (service role)
    'record_sanctions_screening' -- always called via edge fn (service role)
  ];
  fn_sig text;
BEGIN
  FOREACH fname IN ARRAY revoke_anon LOOP
    FOR fn_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fname
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn_sig);
    END LOOP;
  END LOOP;
END $$;
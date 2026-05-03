
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Move both extensions
ALTER EXTENSION vector  SET SCHEMA extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Re-set search_path on every owned function so they can still see
-- vector / pg_trgm operators after the schema move.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS s, p.proname AS f,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions, pg_temp;',
                     r.s, r.f, r.args);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END$$;

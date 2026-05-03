-- Restore EXECUTE on RPCs that the frontend invokes from member/anon contexts.
-- These were over-revoked in the security hardening pass and broke:
--   * client-side rate limiting (every form submit)
--   * failed-login detection on the public login page
--   * invitation validation/redemption during signup
-- All four functions perform their own internal authorization (rate-limit
-- buckets are hashed; invitations require a valid token; record_failed_login
-- only writes audit rows). Safe to expose to anon + authenticated.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('check_rate_limit','record_failed_login','validate_invitation','use_invitation')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', fn.sig);
  END LOOP;
END $$;
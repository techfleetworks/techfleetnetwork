
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'check_fleety_user_quota',
        'fleety_cost_guard_step',
        'fleety_cache_semantic_lookup',
        'fleety_cache_record_hit',
        'fleety_cache_store',
        'fleety_match_canned_answers',
        'fleety_record_cost',
        'fleety_promote_turn_to_canned'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;


-- Helper: only touch functions owned by extensions we don't own
-- (skip anything where the function depends on an extension).

-- ============================================================
-- 1. Set search_path on every owned function missing it
-- ============================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS s, p.proname AS f,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND (p.proconfig IS NULL
           OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp;', r.s, r.f, r.args);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END$$;

-- ============================================================
-- 2. Revoke EXECUTE from anon + authenticated on internal-only DEFINERs
-- ============================================================
DO $$
DECLARE r record;
  keep_auth text[] := ARRAY[
    'approve_and_publish_class','archive_class','cancel_cohort',
    'evaluate_system_health','get_email_pipeline_health',
    'get_company_type_context','get_deliverable_context',
    'get_milestone_blueprint','get_stakeholder_context',
    'get_node_neighbors','get_nodes_neighbors_batch',
    'get_course_completion_counts','get_network_stats',
    'get_member_country_distribution',
    'fleety_match_playbooks','fleety_match_examples',
    'fleety_match_playbooks_semantic','fleety_match_examples_semantic',
    'fleety_kb_semantic_search','fleety_match_canned_answers',
    'fleety_playbooks_by_intent','fleety_few_shot_examples',
    'fleety_record_action','fleety_approve_relationship',
    'fw_lookup_relationships','fw_refresh_search_mv',
    'fw_sync_relationships_to_kb','fw_refresh_neighbors_mv',
    'has_role'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS s, p.proname AS f,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND p.proname <> ALL(keep_auth)
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, authenticated, PUBLIC;',
                     r.s, r.f, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END$$;

-- ============================================================
-- 3. Revoke EXECUTE from anon on remaining DEFINERs
-- ============================================================
DO $$
DECLARE r record;
  keep_anon text[] := ARRAY['get_network_stats','get_member_country_distribution','has_role'];
BEGIN
  FOR r IN
    SELECT n.nspname AS s, p.proname AS f,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND p.proname <> ALL(keep_anon)
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon;', r.s, r.f, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END$$;

-- ============================================================
-- 4. Revoke API access to materialized views
-- ============================================================
REVOKE ALL ON public.framework_node_neighbors_mv FROM anon, authenticated;
REVOKE ALL ON public.framework_search_mv         FROM anon, authenticated;

-- ============================================================
-- 5. Public-bucket policies: per-object SELECT, no LIST
-- ============================================================
DROP POLICY IF EXISTS "Class hero images are publicly viewable" ON storage.objects;
DROP POLICY IF EXISTS "Class hero images are publicly viewable (no list)" ON storage.objects;
CREATE POLICY "Class hero images are publicly viewable (no list)"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'class-hero-images' AND name IS NOT NULL AND length(name) > 0);

DROP POLICY IF EXISTS "Client logos are publicly viewable (no list)" ON storage.objects;
CREATE POLICY "Client logos are publicly viewable (no list)"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'client-logos' AND name IS NOT NULL AND length(name) > 0);


-- =========================================================================
-- 1) LOCK DOWN: replace permissive "Admins can manage" policies with
--    READ-ONLY policies for every authenticated user. Service role bypasses
--    RLS automatically and remains the only writer.
-- =========================================================================
DO $$
DECLARE
  t text;
  ref_tables text[] := ARRAY[
    'reference_activities','reference_agile_methods','reference_company_types',
    'reference_deliverables','reference_duties','reference_job_industries',
    'reference_job_specializations','reference_job_titles','reference_practices',
    'reference_project_milestones','reference_projects','reference_resources',
    'reference_roles','reference_skills','reference_stakeholders',
    'reference_team_functions','reference_tech_job_categories','reference_tools',
    'reference_workshops'
  ];
BEGIN
  FOREACH t IN ARRAY ref_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins can manage '||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated users can read active '||t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'fw_read_active', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'fw_no_client_writes', t);

    -- Read-only for any signed-in user; service_role bypasses RLS.
    EXECUTE format(
      'CREATE POLICY fw_read_active ON public.%I FOR SELECT TO authenticated USING (is_active = true)', t
    );
    -- Defense-in-depth: explicit deny of all client writes (even if a future
    -- permissive policy were added by mistake, this restrictive policy blocks).
    EXECUTE format(
      'CREATE POLICY fw_no_client_writes ON public.%I AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false)', t
    );
    -- Revoke any direct table grants from client roles; PostgREST relies on
    -- the SELECT policy for reads.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, anon', t);
  END LOOP;
END $$;

-- Same treatment for reference_relationships (already locked, but normalize names).
DROP POLICY IF EXISTS "Admins can manage relationships" ON public.reference_relationships;
DROP POLICY IF EXISTS "Authenticated users can read active relationships" ON public.reference_relationships;
DROP POLICY IF EXISTS fw_rel_read_active ON public.reference_relationships;
DROP POLICY IF EXISTS fw_rel_no_client_writes ON public.reference_relationships;

CREATE POLICY fw_rel_read_active ON public.reference_relationships
  FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY fw_rel_no_client_writes ON public.reference_relationships
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reference_relationships FROM authenticated, anon;

-- =========================================================================
-- 2) PERF: relationship lookup indexes (graph traversal for career plans + Fleety)
-- =========================================================================
CREATE INDEX IF NOT EXISTS reference_relationships_from_idx
  ON public.reference_relationships (from_entity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS reference_relationships_to_idx
  ON public.reference_relationships (to_entity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS reference_relationships_pair_idx
  ON public.reference_relationships (from_entity, to_entity) WHERE is_active = true;

-- =========================================================================
-- 3) UNIFIED READ VIEW: one endpoint instead of 20 round-trips.
--    The frontend can now do:
--       supabase.from('framework_entity_v').select('*').eq('entity_type','skills')
--    or fetch every entity type in a single call with .in('entity_type', [...]).
-- =========================================================================
DROP VIEW IF EXISTS public.framework_entity_v CASCADE;

CREATE VIEW public.framework_entity_v
WITH (security_invoker = true) AS
SELECT 'activities'::text          AS entity_type, id, slug, name, description, category, data, is_active, updated_at FROM public.reference_activities
UNION ALL SELECT 'agile_methods',         id, slug, name, description, category, data, is_active, updated_at FROM public.reference_agile_methods
UNION ALL SELECT 'company_types',         id, slug, name, description, category, data, is_active, updated_at FROM public.reference_company_types
UNION ALL SELECT 'deliverables',          id, slug, name, description, category, data, is_active, updated_at FROM public.reference_deliverables
UNION ALL SELECT 'duties',                id, slug, name, description, category, data, is_active, updated_at FROM public.reference_duties
UNION ALL SELECT 'job_industries',        id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_industries
UNION ALL SELECT 'job_specializations',   id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_specializations
UNION ALL SELECT 'job_titles',            id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_titles
UNION ALL SELECT 'practices',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_practices
UNION ALL SELECT 'project_milestones',    id, slug, name, description, category, data, is_active, updated_at FROM public.reference_project_milestones
UNION ALL SELECT 'projects',              id, slug, name, description, category, data, is_active, updated_at FROM public.reference_projects
UNION ALL SELECT 'resources',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_resources
UNION ALL SELECT 'roles',                 id, slug, name, description, category, data, is_active, updated_at FROM public.reference_roles
UNION ALL SELECT 'skills',                id, slug, name, description, category, data, is_active, updated_at FROM public.reference_skills
UNION ALL SELECT 'stakeholders',          id, slug, name, description, category, data, is_active, updated_at FROM public.reference_stakeholders
UNION ALL SELECT 'team_functions',        id, slug, name, description, category, data, is_active, updated_at FROM public.reference_team_functions
UNION ALL SELECT 'tech_job_categories',   id, slug, name, description, category, data, is_active, updated_at FROM public.reference_tech_job_categories
UNION ALL SELECT 'tools',                 id, slug, name, description, category, data, is_active, updated_at FROM public.reference_tools
UNION ALL SELECT 'workshops',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_workshops;

GRANT SELECT ON public.framework_entity_v TO authenticated;
REVOKE ALL ON public.framework_entity_v FROM anon;

COMMENT ON VIEW public.framework_entity_v IS
  'Unified read-only view over all reference_* tables. security_invoker=true so the underlying RLS policies still apply per row.';

-- =========================================================================
-- 4) MATERIALIZED OVERVIEW: counts per entity type (for landing/admin UIs).
-- =========================================================================
DROP MATERIALIZED VIEW IF EXISTS public.framework_overview_mv;

CREATE MATERIALIZED VIEW public.framework_overview_mv AS
SELECT entity_type, count(*)::int AS total, max(updated_at) AS last_updated
FROM public.framework_entity_v
WHERE is_active = true
GROUP BY entity_type;

CREATE UNIQUE INDEX framework_overview_mv_pk ON public.framework_overview_mv(entity_type);
GRANT SELECT ON public.framework_overview_mv TO authenticated;
REVOKE ALL ON public.framework_overview_mv FROM anon;

-- Refresh helper (service role only).
CREATE OR REPLACE FUNCTION public.refresh_framework_overview()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_overview_mv;
END $$;

REVOKE ALL ON FUNCTION public.refresh_framework_overview() FROM PUBLIC, authenticated, anon;

-- One-time refresh so the MV is populated.
REFRESH MATERIALIZED VIEW public.framework_overview_mv;

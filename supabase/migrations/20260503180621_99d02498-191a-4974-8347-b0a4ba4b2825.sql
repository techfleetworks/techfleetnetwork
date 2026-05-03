
-- ============================================================
-- PART A: RENAMES
-- ============================================================

-- A1. Rename reference_team_functions -> reference_job_functions
ALTER TABLE IF EXISTS public.reference_team_functions
  RENAME TO reference_job_functions;

ALTER INDEX IF EXISTS reference_team_functions_pkey         RENAME TO reference_job_functions_pkey;
ALTER INDEX IF EXISTS reference_team_functions_slug_key     RENAME TO reference_job_functions_slug_key;
ALTER INDEX IF EXISTS reference_team_functions_category_idx RENAME TO reference_job_functions_category_idx;
ALTER INDEX IF EXISTS reference_team_functions_data_idx     RENAME TO reference_job_functions_data_idx;
ALTER INDEX IF EXISTS reference_team_functions_name_trgm_idx RENAME TO reference_job_functions_name_trgm_idx;
ALTER INDEX IF EXISTS reference_team_functions_search_idx   RENAME TO reference_job_functions_search_idx;

-- Recreate triggers under new names (drop+create handles the rename cleanly)
DROP TRIGGER IF EXISTS trg_reference_team_functions_search   ON public.reference_job_functions;
DROP TRIGGER IF EXISTS trg_reference_team_functions_updated_at ON public.reference_job_functions;
CREATE TRIGGER trg_reference_job_functions_search
  BEFORE INSERT OR UPDATE ON public.reference_job_functions
  FOR EACH ROW EXECUTE FUNCTION public.set_reference_search_tsv();
CREATE TRIGGER trg_reference_job_functions_updated_at
  BEFORE UPDATE ON public.reference_job_functions
  FOR EACH ROW EXECUTE FUNCTION public.set_reference_updated_at();

-- Attach KB sync trigger using the new entity label
DROP TRIGGER IF EXISTS trg_fw_kb_sync ON public.reference_job_functions;
CREATE TRIGGER trg_fw_kb_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.reference_job_functions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_reference_to_kb('job_functions');

-- A2. Drop legacy reference_roles (data already lives in reference_duties).
-- Move any stray rows over first by slug to be safe.
INSERT INTO public.reference_duties (slug, name, description, category, data, source, source_row_id, is_active)
SELECT r.slug, r.name, r.description, r.category, r.data, r.source, r.source_row_id, r.is_active
FROM public.reference_roles r
ON CONFLICT (slug) DO NOTHING;

DROP TABLE IF EXISTS public.reference_roles CASCADE;

-- A3. Rebuild framework_entity_v without "roles", with "job_functions"
DROP VIEW IF EXISTS public.framework_entity_v CASCADE;

CREATE VIEW public.framework_entity_v AS
  SELECT 'activities'::text         AS entity_type, id, slug, name, description, category, data, is_active, updated_at FROM public.reference_activities
  UNION ALL SELECT 'agile_methods',         id, slug, name, description, category, data, is_active, updated_at FROM public.reference_agile_methods
  UNION ALL SELECT 'company_types',         id, slug, name, description, category, data, is_active, updated_at FROM public.reference_company_types
  UNION ALL SELECT 'deliverables',          id, slug, name, description, category, data, is_active, updated_at FROM public.reference_deliverables
  UNION ALL SELECT 'duties',                id, slug, name, description, category, data, is_active, updated_at FROM public.reference_duties
  UNION ALL SELECT 'job_functions',         id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_functions
  UNION ALL SELECT 'job_industries',        id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_industries
  UNION ALL SELECT 'job_specializations',   id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_specializations
  UNION ALL SELECT 'job_titles',            id, slug, name, description, category, data, is_active, updated_at FROM public.reference_job_titles
  UNION ALL SELECT 'practices',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_practices
  UNION ALL SELECT 'project_milestones',    id, slug, name, description, category, data, is_active, updated_at FROM public.reference_project_milestones
  UNION ALL SELECT 'projects',              id, slug, name, description, category, data, is_active, updated_at FROM public.reference_projects
  UNION ALL SELECT 'resources',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_resources
  UNION ALL SELECT 'skills',                id, slug, name, description, category, data, is_active, updated_at FROM public.reference_skills
  UNION ALL SELECT 'stakeholders',          id, slug, name, description, category, data, is_active, updated_at FROM public.reference_stakeholders
  UNION ALL SELECT 'tech_job_categories',   id, slug, name, description, category, data, is_active, updated_at FROM public.reference_tech_job_categories
  UNION ALL SELECT 'tools',                 id, slug, name, description, category, data, is_active, updated_at FROM public.reference_tools
  UNION ALL SELECT 'workshops',             id, slug, name, description, category, data, is_active, updated_at FROM public.reference_workshops;

GRANT SELECT ON public.framework_entity_v TO authenticated, anon;

-- A4. Knowledge base url + content rewrites
UPDATE public.knowledge_base
SET url = replace(url, 'framework://entity/team_functions/', 'framework://entity/job_functions/')
WHERE url LIKE 'framework://entity/team_functions/%';

UPDATE public.knowledge_base
SET url = replace(url, 'framework://entity/roles/', 'framework://entity/duties/')
WHERE url LIKE 'framework://entity/roles/%';

UPDATE public.knowledge_base
SET title = regexp_replace(title, '\mTeam Functions?\M', 'Job Functions', 'g'),
    content = regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(content, 'Team Functions?', 'Job Functions', 'g'),
                    'Hard Skills?', 'Technical and Interpersonal Skills', 'g'),
                  'Soft Skills?', 'Team Practices', 'g'),
                '\mRoles\M', 'Duties', 'g')
WHERE url LIKE 'framework://%';

-- ============================================================
-- PART B: JSONB key renames inside reference_* rows (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fw_rename_jsonb_keys(p_data jsonb, p_pairs text[][])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  out jsonb := COALESCE(p_data, '{}'::jsonb);
  i int;
  old_key text;
  new_key text;
BEGIN
  IF p_pairs IS NULL THEN RETURN out; END IF;
  FOR i IN 1 .. array_length(p_pairs, 1) LOOP
    old_key := p_pairs[i][1];
    new_key := p_pairs[i][2];
    IF out ? old_key AND NOT (out ? new_key) THEN
      out := out - old_key || jsonb_build_object(new_key, out->old_key);
    ELSIF out ? old_key THEN
      out := out - old_key;
    END IF;
  END LOOP;
  RETURN out;
END;
$$;

DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['Required Hard Skills', 'Required Technical and Interpersonal Skills'],
    ['How to Measure Success in the Hard Skill', 'How to Measure Success in the Skill'],
    ['Team Functions Associated With This Skill', 'Job Functions Associated With This Skill'],
    ['Hard Skills', 'Technical and Interpersonal Skills'],
    ['Soft Skills', 'Team Practices'],
    ['Roles', 'Duties'],
    ['Team Functions', 'Job Functions']
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'reference_activities','reference_agile_methods','reference_company_types','reference_deliverables',
    'reference_duties','reference_job_functions','reference_job_industries','reference_job_specializations',
    'reference_job_titles','reference_practices','reference_project_milestones','reference_projects',
    'reference_resources','reference_skills','reference_stakeholders','reference_tech_job_categories',
    'reference_tools','reference_workshops'
  ] LOOP
    EXECUTE format('UPDATE public.%I SET data = public.fw_rename_jsonb_keys(data, $1) WHERE data ?| ARRAY[''Required Hard Skills'',''How to Measure Success in the Hard Skill'',''Team Functions Associated With This Skill'',''Hard Skills'',''Soft Skills'',''Roles'',''Team Functions'']', t)
      USING pairs;
  END LOOP;
END $$;

-- ============================================================
-- PART C: FRAMEWORK GRAPH ENUMS + TABLES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.framework_entity_type AS ENUM (
    'activity','agile_method','company_type','deliverable','duty',
    'job_function','job_industry','job_specialization','job_title',
    'practice','project_milestone','project','resource','skill',
    'stakeholder','tech_job_category','tool','workshop','handbook'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.framework_rel_type AS ENUM (
    'produces','requires_skill','requires_activity','requires_deliverable',
    'excludes_deliverable','uses_tool','uses_practice','performed_by',
    'teaches_skill','part_of','applies_method','targets_company_type',
    'engages_stakeholder','collaborates_on','owned_by','related_to',
    'precedes','references_resource','works_with'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.framework_edges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_type    public.framework_entity_type NOT NULL,
  src_id      uuid NOT NULL,
  rel_type    public.framework_rel_type NOT NULL,
  dst_type    public.framework_entity_type NOT NULL,
  dst_id      uuid NOT NULL,
  weight      smallint NOT NULL DEFAULT 1,
  source      text NOT NULL DEFAULT 'csv',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT framework_edges_unique UNIQUE (src_type, src_id, rel_type, dst_type, dst_id),
  CONSTRAINT framework_edges_no_self CHECK (NOT (src_type = dst_type AND src_id = dst_id))
);
CREATE INDEX IF NOT EXISTS framework_edges_src_idx ON public.framework_edges (src_type, src_id, rel_type);
CREATE INDEX IF NOT EXISTS framework_edges_dst_idx ON public.framework_edges (dst_type, dst_id, rel_type);

ALTER TABLE public.framework_edges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS framework_edges_read ON public.framework_edges;
CREATE POLICY framework_edges_read ON public.framework_edges
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS framework_edges_service_write ON public.framework_edges;
CREATE POLICY framework_edges_service_write ON public.framework_edges
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.framework_edge_staging (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  src_type    public.framework_entity_type,
  src_name    text,
  rel_type    public.framework_rel_type,
  dst_type    public.framework_entity_type,
  dst_name    text NOT NULL,
  source      text NOT NULL DEFAULT 'csv',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS framework_edge_staging_unresolved_idx
  ON public.framework_edge_staging (dst_type, lower(dst_name)) WHERE resolved_at IS NULL;

ALTER TABLE public.framework_edge_staging ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS framework_edge_staging_admin_read ON public.framework_edge_staging;
CREATE POLICY framework_edge_staging_admin_read ON public.framework_edge_staging
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS framework_edge_staging_service_write ON public.framework_edge_staging;
CREATE POLICY framework_edge_staging_service_write ON public.framework_edge_staging
  FOR ALL TO public USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- PART D: HELPER FUNCTIONS
-- ============================================================

-- Resolve an entity name → uuid (case-insensitive, slug-fallback)
CREATE OR REPLACE FUNCTION public.fw_resolve_entity(p_type public.framework_entity_type, p_name text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_slug text;
BEGIN
  IF v_name = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_id
  FROM public.framework_entity_v
  WHERE entity_type = p_type::text AND lower(name) = lower(v_name) AND is_active
  LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_slug := lower(regexp_replace(regexp_replace(v_name, '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
  SELECT id INTO v_id
  FROM public.framework_entity_v
  WHERE entity_type = p_type::text AND slug = v_slug AND is_active
  LIMIT 1;
  RETURN v_id;
END;
$$;

-- Insert one edge (with auto-staging on unresolved dst). Assumes src_id is known.
CREATE OR REPLACE FUNCTION public.fw_upsert_edge(
  p_src_type public.framework_entity_type, p_src_id uuid,
  p_rel public.framework_rel_type,
  p_dst_type public.framework_entity_type, p_dst_name text,
  p_source text DEFAULT 'csv'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dst uuid;
BEGIN
  IF p_dst_name IS NULL OR btrim(p_dst_name) = '' THEN RETURN; END IF;
  v_dst := public.fw_resolve_entity(p_dst_type, p_dst_name);
  IF v_dst IS NULL THEN
    INSERT INTO public.framework_edge_staging (src_type, src_name, rel_type, dst_type, dst_name, source)
    VALUES (p_src_type,
            (SELECT name FROM public.framework_entity_v WHERE entity_type=p_src_type::text AND id=p_src_id LIMIT 1),
            p_rel, p_dst_type, p_dst_name, p_source);
    RETURN;
  END IF;
  IF p_src_type = p_dst_type AND p_src_id = v_dst THEN RETURN; END IF;
  INSERT INTO public.framework_edges (src_type, src_id, rel_type, dst_type, dst_id, source)
  VALUES (p_src_type, p_src_id, p_rel, p_dst_type, v_dst, p_source)
  ON CONFLICT ON CONSTRAINT framework_edges_unique DO NOTHING;
END;
$$;

-- Split + dedupe a comma-separated cell (case-insensitive, sorted)
CREATE OR REPLACE FUNCTION public.fw_split_dedupe(p_value text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT v ORDER BY v), '{}'::text[])
  FROM (
    SELECT btrim(regexp_replace(unnest, '\s+', ' ', 'g')) AS v
    FROM unnest(string_to_array(COALESCE(p_value, ''), ','))
  ) s
  WHERE v IS NOT NULL AND v <> '';
$$;

-- Map of (entity_type, jsonb_key_pattern) → (rel_type, dst_type)
-- Centralized so rebuild sees the same rules as ingest.
CREATE OR REPLACE FUNCTION public.fw_emit_edges_for_entity(
  p_src_type public.framework_entity_type, p_src_id uuid, p_data jsonb, p_source text DEFAULT 'rebuild'
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text; v text; n text; cnt int := 0;
  -- Mapping table: (key_substring_lower, rel_type, dst_type)
  rules text[][] := ARRAY[
    ['deliverables', 'produces',              'deliverable'],
    ['common deliverables', 'requires_deliverable',  'deliverable'],
    ['deliverables usually not included', 'excludes_deliverable', 'deliverable'],
    ['required activities', 'requires_activity',     'activity'],
    ['activities',          'requires_activity',     'activity'],
    ['required hard skills','requires_skill',        'skill'],
    ['required technical and interpersonal skills', 'requires_skill', 'skill'],
    ['required skills',     'requires_skill',        'skill'],
    ['skills',              'requires_skill',        'skill'],
    ['tools',               'uses_tool',             'tool'],
    ['practices',           'uses_practice',         'practice'],
    ['team practices',      'uses_practice',         'practice'],
    ['stakeholders',        'engages_stakeholder',   'stakeholder'],
    ['relevant company types','targets_company_type','company_type'],
    ['company types',       'targets_company_type',  'company_type'],
    ['duties',              'performed_by',          'duty'],
    ['duty who owns',       'owned_by',              'duty'],
    ['job functions',       'part_of',               'job_function'],
    ['job titles',          'performed_by',          'job_title'],
    ['milestones',          'part_of',               'project_milestone'],
    ['project milestones',  'part_of',               'project_milestone'],
    ['agile methods',       'applies_method',        'agile_method'],
    ['workshops',           'teaches_skill',         'workshop'],
    ['resources',           'references_resource',   'resource'],
    ['specializations',     'related_to',            'job_specialization'],
    ['job specializations', 'related_to',            'job_specialization']
  ];
  rule_idx int;
  rk text; rrel text; rdst text;
  matched boolean;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each_text(COALESCE(p_data,'{}'::jsonb)) LOOP
    matched := false;
    FOR rule_idx IN 1 .. array_length(rules,1) LOOP
      rk := rules[rule_idx][1];
      IF position(rk in lower(k)) > 0 THEN
        rrel := rules[rule_idx][2]; rdst := rules[rule_idx][3];
        FOR n IN SELECT unnest(public.fw_split_dedupe(v)) LOOP
          PERFORM public.fw_upsert_edge(p_src_type, p_src_id,
                  rrel::public.framework_rel_type, rdst::public.framework_entity_type, n, p_source);
          cnt := cnt + 1;
        END LOOP;
        matched := true;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN cnt;
END;
$$;

-- Map reference table -> entity type
CREATE OR REPLACE FUNCTION public.fw_table_to_entity(p_table text)
RETURNS public.framework_entity_type
LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE p_table
    WHEN 'reference_activities'         THEN 'activity'
    WHEN 'reference_agile_methods'      THEN 'agile_method'
    WHEN 'reference_company_types'      THEN 'company_type'
    WHEN 'reference_deliverables'       THEN 'deliverable'
    WHEN 'reference_duties'             THEN 'duty'
    WHEN 'reference_job_functions'      THEN 'job_function'
    WHEN 'reference_job_industries'     THEN 'job_industry'
    WHEN 'reference_job_specializations' THEN 'job_specialization'
    WHEN 'reference_job_titles'         THEN 'job_title'
    WHEN 'reference_practices'          THEN 'practice'
    WHEN 'reference_project_milestones' THEN 'project_milestone'
    WHEN 'reference_projects'           THEN 'project'
    WHEN 'reference_resources'          THEN 'resource'
    WHEN 'reference_skills'             THEN 'skill'
    WHEN 'reference_stakeholders'       THEN 'stakeholder'
    WHEN 'reference_tech_job_categories' THEN 'tech_job_category'
    WHEN 'reference_tools'              THEN 'tool'
    WHEN 'reference_workshops'          THEN 'workshop'
  END)::public.framework_entity_type;
$$;

-- Rebuild all edges (idempotent — safe to call repeatedly)
CREATE OR REPLACE FUNCTION public.fw_rebuild_all_edges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text; r record; total int := 0;
BEGIN
  -- Optional: clear staging older than this run for a clean view
  DELETE FROM public.framework_edge_staging WHERE created_at < now() - interval '90 days';
  FOREACH t IN ARRAY ARRAY[
    'reference_activities','reference_agile_methods','reference_company_types','reference_deliverables',
    'reference_duties','reference_job_functions','reference_job_industries','reference_job_specializations',
    'reference_job_titles','reference_practices','reference_project_milestones','reference_projects',
    'reference_resources','reference_skills','reference_stakeholders','reference_tech_job_categories',
    'reference_tools','reference_workshops'
  ] LOOP
    FOR r IN EXECUTE format('SELECT id, data FROM public.%I WHERE is_active', t) LOOP
      total := total + public.fw_emit_edges_for_entity(public.fw_table_to_entity(t), r.id, r.data, 'rebuild');
    END LOOP;
  END LOOP;

  -- Auto-create inverse edges for symmetric-ish relationships
  -- (only the read-RPC needs inverses; we keep edges directional in storage to stay precise)
  RETURN total;
END;
$$;

-- ============================================================
-- PART E: NEIGHBORS MV + READ RPCS
-- ============================================================
DROP MATERIALIZED VIEW IF EXISTS public.framework_node_neighbors_mv;
CREATE MATERIALIZED VIEW public.framework_node_neighbors_mv AS
WITH out_edges AS (
  SELECT e.src_type AS node_type, e.src_id AS node_id,
         jsonb_agg(jsonb_build_object('rel', e.rel_type, 'type', e.dst_type, 'id', e.dst_id, 'name', n.name) ORDER BY n.name) AS outgoing
  FROM public.framework_edges e
  JOIN public.framework_entity_v n ON n.entity_type = e.dst_type::text AND n.id = e.dst_id
  GROUP BY e.src_type, e.src_id
),
in_edges AS (
  SELECT e.dst_type AS node_type, e.dst_id AS node_id,
         jsonb_agg(jsonb_build_object('rel', e.rel_type, 'type', e.src_type, 'id', e.src_id, 'name', n.name) ORDER BY n.name) AS incoming
  FROM public.framework_edges e
  JOIN public.framework_entity_v n ON n.entity_type = e.src_type::text AND n.id = e.src_id
  GROUP BY e.dst_type, e.dst_id
)
SELECT
  COALESCE(o.node_type, i.node_type) AS node_type,
  COALESCE(o.node_id, i.node_id) AS node_id,
  jsonb_build_object(
    'outgoing', COALESCE(o.outgoing, '[]'::jsonb),
    'incoming', COALESCE(i.incoming, '[]'::jsonb)
  ) AS neighbors
FROM out_edges o
FULL OUTER JOIN in_edges i ON i.node_type = o.node_type AND i.node_id = o.node_id;

CREATE UNIQUE INDEX framework_node_neighbors_mv_pk
  ON public.framework_node_neighbors_mv (node_type, node_id);

-- READ RPCs
CREATE OR REPLACE FUNCTION public.get_node_neighbors(p_type public.framework_entity_type, p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(neighbors, '{"outgoing":[],"incoming":[]}'::jsonb)
  FROM public.framework_node_neighbors_mv
  WHERE node_type = p_type AND node_id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.search_framework(p_query text, p_limit int DEFAULT 10)
RETURNS TABLE (entity_type text, id uuid, slug text, name text, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT entity_type, id, slug, name, left(description, 240) AS snippet
  FROM public.framework_entity_v
  WHERE is_active
    AND (
      lower(name) LIKE '%' || lower(p_query) || '%'
      OR lower(description) LIKE '%' || lower(p_query) || '%'
      OR similarity(name, p_query) > 0.25
    )
  ORDER BY similarity(name, p_query) DESC NULLS LAST, length(name) ASC
  LIMIT GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
$$;

CREATE OR REPLACE FUNCTION public.get_deliverable_context(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entity', to_jsonb(e),
    'neighbors', COALESCE(public.get_node_neighbors('deliverable', p_id), '{}'::jsonb)
  )
  FROM public.framework_entity_v e
  WHERE e.entity_type='deliverables' AND e.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_milestone_blueprint(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entity', to_jsonb(e),
    'neighbors', COALESCE(public.get_node_neighbors('project_milestone', p_id), '{}'::jsonb)
  )
  FROM public.framework_entity_v e
  WHERE e.entity_type='project_milestones' AND e.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_company_type_context(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entity', to_jsonb(e),
    'neighbors', COALESCE(public.get_node_neighbors('company_type', p_id), '{}'::jsonb)
  )
  FROM public.framework_entity_v e
  WHERE e.entity_type='company_types' AND e.id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.get_stakeholder_context(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'entity', to_jsonb(e),
    'neighbors', COALESCE(public.get_node_neighbors('stakeholder', p_id), '{}'::jsonb)
  )
  FROM public.framework_entity_v e
  WHERE e.entity_type='stakeholders' AND e.id = p_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_node_neighbors(public.framework_entity_type, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_framework(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_deliverable_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_milestone_blueprint(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_type_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stakeholder_context(uuid) TO authenticated;

-- Refresh helper (rate-limited — caller decides cadence)
CREATE OR REPLACE FUNCTION public.fw_refresh_neighbors_mv()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_node_neighbors_mv;
EXCEPTION WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
  REFRESH MATERIALIZED VIEW public.framework_node_neighbors_mv;
END;
$$;
GRANT EXECUTE ON FUNCTION public.fw_refresh_neighbors_mv() TO authenticated;

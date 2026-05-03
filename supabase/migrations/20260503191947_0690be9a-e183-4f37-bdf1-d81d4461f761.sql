-- ============================================================
-- Fleety performance pass: batched neighbors + materialized search
-- ============================================================
-- Goals:
--   1. Cut 8 sequential RPCs per chat → 1 batched RPC.
--   2. Replace 18-table UNION ALL trigram scan per chat → single
--      materialized view with GIN trigram + tsvector indexes.
--   3. Keep results functionally identical; both sides remain
--      bidirectional via framework_node_neighbors_mv.

-- ---------- 1. Batched neighbors RPC ------------------------
CREATE OR REPLACE FUNCTION public.get_nodes_neighbors_batch(p_nodes jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- p_nodes: [{"type":"skill","id":"<uuid>"}, ...]
  -- Returns: {"<type>:<id>": {outgoing:[...], incoming:[...]}, ...}
  WITH req AS (
    SELECT (elem->>'type')::framework_entity_type AS node_type,
           (elem->>'id')::uuid AS node_id
    FROM jsonb_array_elements(coalesce(p_nodes, '[]'::jsonb)) AS elem
  )
  SELECT COALESCE(
    jsonb_object_agg(
      (req.node_type::text || ':' || req.node_id::text),
      COALESCE(mv.neighbors, '{"outgoing":[],"incoming":[]}'::jsonb)
    ),
    '{}'::jsonb
  )
  FROM req
  LEFT JOIN public.framework_node_neighbors_mv mv
    ON mv.node_type = req.node_type AND mv.node_id = req.node_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_nodes_neighbors_batch(jsonb)
  TO authenticated, service_role;

-- ---------- 2. Materialized search index --------------------
-- Single physical table over all 18 reference_* sources, with
-- a precomputed tsvector (FTS) and indexes on lower(name) for
-- prefix/exact match. One scan replaces 18 UNION ALL scans.
DROP MATERIALIZED VIEW IF EXISTS public.framework_search_mv CASCADE;

CREATE MATERIALIZED VIEW public.framework_search_mv AS
SELECT entity_type, id, slug, name, description, name_lc,
       to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'')) AS doc_tsv
FROM (
  SELECT 'activity'::text AS entity_type, id, slug, name, description, lower(name) AS name_lc FROM public.reference_activities WHERE is_active
  UNION ALL SELECT 'agile_method', id, slug, name, description, lower(name) FROM public.reference_agile_methods WHERE is_active
  UNION ALL SELECT 'company_type', id, slug, name, description, lower(name) FROM public.reference_company_types WHERE is_active
  UNION ALL SELECT 'deliverable', id, slug, name, description, lower(name) FROM public.reference_deliverables WHERE is_active
  UNION ALL SELECT 'duty', id, slug, name, description, lower(name) FROM public.reference_duties WHERE is_active
  UNION ALL SELECT 'job_function', id, slug, name, description, lower(name) FROM public.reference_job_functions WHERE is_active
  UNION ALL SELECT 'job_industry', id, slug, name, description, lower(name) FROM public.reference_job_industries WHERE is_active
  UNION ALL SELECT 'job_specialization', id, slug, name, description, lower(name) FROM public.reference_job_specializations WHERE is_active
  UNION ALL SELECT 'job_title', id, slug, name, description, lower(name) FROM public.reference_job_titles WHERE is_active
  UNION ALL SELECT 'practice', id, slug, name, description, lower(name) FROM public.reference_practices WHERE is_active
  UNION ALL SELECT 'project_milestone', id, slug, name, description, lower(name) FROM public.reference_project_milestones WHERE is_active
  UNION ALL SELECT 'project', id, slug, name, description, lower(name) FROM public.reference_projects WHERE is_active
  UNION ALL SELECT 'resource', id, slug, name, description, lower(name) FROM public.reference_resources WHERE is_active
  UNION ALL SELECT 'skill', id, slug, name, description, lower(name) FROM public.reference_skills WHERE is_active
  UNION ALL SELECT 'stakeholder', id, slug, name, description, lower(name) FROM public.reference_stakeholders WHERE is_active
  UNION ALL SELECT 'tech_job_category', id, slug, name, description, lower(name) FROM public.reference_tech_job_categories WHERE is_active
  UNION ALL SELECT 'tool', id, slug, name, description, lower(name) FROM public.reference_tools WHERE is_active
  UNION ALL SELECT 'workshop', id, slug, name, description, lower(name) FROM public.reference_workshops WHERE is_active
) src;

CREATE UNIQUE INDEX framework_search_mv_pk
  ON public.framework_search_mv (entity_type, id);
CREATE INDEX framework_search_mv_name_trgm
  ON public.framework_search_mv USING GIN (name gin_trgm_ops);
CREATE INDEX framework_search_mv_name_lc
  ON public.framework_search_mv (name_lc text_pattern_ops);
CREATE INDEX framework_search_mv_doc_tsv
  ON public.framework_search_mv USING GIN (doc_tsv);

-- Refresh helper (concurrently to avoid blocking chat traffic).
CREATE OR REPLACE FUNCTION public.fw_refresh_search_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_search_mv;
EXCEPTION WHEN feature_not_supported THEN
  REFRESH MATERIALIZED VIEW public.framework_search_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fw_refresh_search_mv() TO service_role;

-- New search RPC: hybrid trigram + FTS rank, 1 scan instead of 18.
CREATE OR REPLACE FUNCTION public.search_framework(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(entity_type text, id uuid, slug text, name text, snippet text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH q AS (
    SELECT coalesce(p_query,'') AS qr,
           lower(coalesce(p_query,'')) AS qn,
           websearch_to_tsquery('english', coalesce(p_query,'')) AS qts
  )
  SELECT m.entity_type, m.id, m.slug, m.name, left(m.description, 240) AS snippet
  FROM public.framework_search_mv m, q
  WHERE m.name % q.qr
     OR m.name_lc LIKE '%' || q.qn || '%'
     OR (q.qts IS NOT NULL AND m.doc_tsv @@ q.qts)
  ORDER BY
    GREATEST(
      similarity(m.name, q.qr),
      CASE WHEN m.name_lc = q.qn THEN 1.0
           WHEN m.name_lc LIKE q.qn || '%' THEN 0.8
           WHEN m.name_lc LIKE '%' || q.qn || '%' THEN 0.6
           ELSE 0 END,
      CASE WHEN q.qts IS NOT NULL THEN ts_rank(m.doc_tsv, q.qts) * 0.7 ELSE 0 END
    ) DESC NULLS LAST,
    length(m.name) ASC
  LIMIT GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
$$;

-- Initial populate so the function works immediately.
SELECT public.fw_refresh_search_mv();
ANALYZE public.framework_search_mv;
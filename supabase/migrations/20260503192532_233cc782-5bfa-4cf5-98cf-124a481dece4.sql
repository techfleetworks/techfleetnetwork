-- ============================================================
-- Sync reference_relationships → knowledge_base + search MV
-- + lookup RPC for chat function
-- ============================================================

-- Plural framework key → singular framework_entity_type mapping
-- ("roles" intentionally maps to 'duty' per the alias memory).
CREATE OR REPLACE FUNCTION public.fw_entity_key_to_type(p_key text)
RETURNS framework_entity_type
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_key,''))
    WHEN 'activities'         THEN 'activity'
    WHEN 'agile_methods'      THEN 'agile_method'
    WHEN 'company_types'      THEN 'company_type'
    WHEN 'deliverables'       THEN 'deliverable'
    WHEN 'duties'             THEN 'duty'
    WHEN 'roles'              THEN 'duty'
    WHEN 'job_functions'      THEN 'job_function'
    WHEN 'job_industries'     THEN 'job_industry'
    WHEN 'job_specializations'THEN 'job_specialization'
    WHEN 'specializations'    THEN 'job_specialization'
    WHEN 'job_titles'         THEN 'job_title'
    WHEN 'practices'          THEN 'practice'
    WHEN 'project_milestones' THEN 'project_milestone'
    WHEN 'projects'           THEN 'project'
    WHEN 'resources'          THEN 'resource'
    WHEN 'skills'             THEN 'skill'
    WHEN 'stakeholders'       THEN 'stakeholder'
    WHEN 'tech_job_categories'THEN 'tech_job_category'
    WHEN 'tools'              THEN 'tool'
    WHEN 'workshops'          THEN 'workshop'
    ELSE NULL
  END::framework_entity_type;
$$;

-- ─── 1. Sync into knowledge_base (canonical KB) ──────────────
CREATE OR REPLACE FUNCTION public.fw_sync_relationships_to_kb()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer := 0;
BEGIN
  -- Remove stale relationship rows so deletes/edits propagate.
  DELETE FROM public.knowledge_base WHERE url LIKE 'framework://relationships/%';

  INSERT INTO public.knowledge_base (url, title, content, scraped_at)
  SELECT
    'framework://relationships/' || from_entity || '__' || to_entity AS url,
    'Relationship: ' || from_entity || ' ↔ ' || to_entity AS title,
    -- Verbatim PDF wording, both directions when available.
    'FORWARD (' || from_entity || ' → ' || to_entity || '): ' || description ||
    CASE
      WHEN inverse_description IS NOT NULL AND length(trim(inverse_description)) > 0
        THEN E'\nINVERSE (' || to_entity || ' → ' || from_entity || '): ' || inverse_description
      ELSE ''
    END ||
    CASE
      WHEN jsonb_array_length(coalesce(all_descriptions,'[]'::jsonb)) > 0
        THEN E'\nALL PHRASINGS: ' || (
          SELECT string_agg(elem #>> '{}', ' | ')
          FROM jsonb_array_elements(all_descriptions) elem
        )
      ELSE ''
    END AS content,
    now() AS scraped_at
  FROM public.reference_relationships
  WHERE is_active;

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fw_sync_relationships_to_kb() TO service_role;

-- ─── 2. Add relationships as a virtual entity in search MV ───
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
  -- Virtual entity: PDF relationship sentences (both directions concatenated).
  UNION ALL
  SELECT 'relationship'::text,
         id,
         (from_entity || '__' || to_entity) AS slug,
         (from_entity || ' ↔ ' || to_entity) AS name,
         description ||
           CASE WHEN inverse_description IS NOT NULL AND length(trim(inverse_description))>0
                THEN ' || ' || inverse_description ELSE '' END AS description,
         lower(from_entity || ' ' || to_entity) AS name_lc
  FROM public.reference_relationships WHERE is_active
) src;

CREATE UNIQUE INDEX framework_search_mv_pk
  ON public.framework_search_mv (entity_type, id);
CREATE INDEX framework_search_mv_name_trgm
  ON public.framework_search_mv USING GIN (name gin_trgm_ops);
CREATE INDEX framework_search_mv_name_lc
  ON public.framework_search_mv (name_lc text_pattern_ops);
CREATE INDEX framework_search_mv_doc_tsv
  ON public.framework_search_mv USING GIN (doc_tsv);

-- ─── 3. Pair lookup RPC for chat function ────────────────────
-- Returns the verbatim sentence(s) for a set of entity_type pairs.
-- Input: jsonb array of {a:"skill", b:"deliverable"} objects.
-- Output: array of {a, b, forward, inverse} rows. Direction-agnostic.
CREATE OR REPLACE FUNCTION public.fw_lookup_relationships(p_pairs jsonb)
RETURNS TABLE(a text, b text, forward text, inverse text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH pairs AS (
    SELECT lower(elem->>'a') AS a, lower(elem->>'b') AS b
    FROM jsonb_array_elements(coalesce(p_pairs,'[]'::jsonb)) elem
    WHERE elem->>'a' IS NOT NULL AND elem->>'b' IS NOT NULL
  ),
  expanded AS (
    -- Match either direction; remap entity-type singulars to the
    -- plural keys stored in reference_relationships.
    SELECT p.a, p.b, r.description AS forward, r.inverse_description AS inverse
    FROM pairs p
    JOIN public.reference_relationships r
      ON r.is_active
     AND public.fw_entity_key_to_type(r.from_entity) = p.a::framework_entity_type
     AND public.fw_entity_key_to_type(r.to_entity)   = p.b::framework_entity_type
    UNION ALL
    SELECT p.a, p.b, r.inverse_description AS forward, r.description AS inverse
    FROM pairs p
    JOIN public.reference_relationships r
      ON r.is_active
     AND public.fw_entity_key_to_type(r.from_entity) = p.b::framework_entity_type
     AND public.fw_entity_key_to_type(r.to_entity)   = p.a::framework_entity_type
  )
  SELECT a, b, forward, inverse
  FROM expanded
  WHERE forward IS NOT NULL AND length(trim(forward)) > 0;
$$;

GRANT EXECUTE ON FUNCTION public.fw_lookup_relationships(jsonb)
  TO authenticated, service_role;

-- ─── 4. Re-create search RPC (unchanged behaviour) ───────────
CREATE OR REPLACE FUNCTION public.search_framework(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(entity_type text, id uuid, slug text, name text, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER
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

-- ─── 5. Refresh helper (unchanged signature) ─────────────────
CREATE OR REPLACE FUNCTION public.fw_refresh_search_mv()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_search_mv;
EXCEPTION WHEN feature_not_supported THEN
  REFRESH MATERIALIZED VIEW public.framework_search_mv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fw_refresh_search_mv() TO service_role;

-- ─── 6. Initial populate ─────────────────────────────────────
SELECT public.fw_sync_relationships_to_kb();
SELECT public.fw_refresh_search_mv();
ANALYZE public.framework_search_mv;

-- 1) search_framework: per-table union to leverage trgm name indexes.
DROP FUNCTION IF EXISTS public.search_framework(text, integer);
CREATE FUNCTION public.search_framework(p_query text, p_limit integer DEFAULT 10)
RETURNS TABLE(entity_type text, id uuid, slug text, name text, snippet text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH q AS (
    SELECT coalesce(p_query,'') AS qr,
           lower(coalesce(p_query,'')) AS qn,
           '%' || lower(coalesce(p_query,'')) || '%' AS qlike
  ),
  candidates AS (
    SELECT 'activity'::text AS entity_type, id, slug, name, description FROM public.reference_activities, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'agile_method', id, slug, name, description FROM public.reference_agile_methods, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'company_type', id, slug, name, description FROM public.reference_company_types, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'deliverable', id, slug, name, description FROM public.reference_deliverables, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'duty', id, slug, name, description FROM public.reference_duties, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'job_function', id, slug, name, description FROM public.reference_job_functions, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'job_industry', id, slug, name, description FROM public.reference_job_industries, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'job_specialization', id, slug, name, description FROM public.reference_job_specializations, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'job_title', id, slug, name, description FROM public.reference_job_titles, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'practice', id, slug, name, description FROM public.reference_practices, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'project_milestone', id, slug, name, description FROM public.reference_project_milestones, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'project', id, slug, name, description FROM public.reference_projects, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'resource', id, slug, name, description FROM public.reference_resources, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'skill', id, slug, name, description FROM public.reference_skills, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'stakeholder', id, slug, name, description FROM public.reference_stakeholders, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'tech_job_category', id, slug, name, description FROM public.reference_tech_job_categories, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'tool', id, slug, name, description FROM public.reference_tools, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
    UNION ALL SELECT 'workshop', id, slug, name, description FROM public.reference_workshops, q WHERE is_active AND (name % q.qr OR lower(name) LIKE q.qlike)
  )
  SELECT c.entity_type, c.id, c.slug, c.name, left(c.description, 240) AS snippet
  FROM candidates c, q
  ORDER BY
    GREATEST(
      similarity(c.name, q.qr),
      CASE WHEN lower(c.name) = q.qn THEN 1.0
           WHEN lower(c.name) LIKE q.qn || '%' THEN 0.8
           WHEN lower(c.name) LIKE '%' || q.qn || '%' THEN 0.6
           ELSE 0 END
    ) DESC NULLS LAST,
    length(c.name) ASC
  LIMIT GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
$$;

REVOKE EXECUTE ON FUNCTION public.search_framework(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_framework(text, integer) TO authenticated;

-- 2) Rebuild routine with concurrent MV refresh + ANALYZE.
DROP FUNCTION IF EXISTS public.fw_rebuild_all_edges();
CREATE FUNCTION public.fw_rebuild_all_edges()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t text; r record; total int := 0;
BEGIN
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

  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.framework_node_neighbors_mv;
  EXCEPTION WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
    REFRESH MATERIALIZED VIEW public.framework_node_neighbors_mv;
  END;

  ANALYZE public.framework_edges;
  ANALYZE public.framework_node_neighbors_mv;
  RETURN total;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fw_rebuild_all_edges() FROM PUBLIC, anon, authenticated;

-- 3) Flush remaining staging now.
SELECT public.fw_rebuild_all_edges();
SELECT public.fw_replay_staging();

ANALYZE public.reference_skills;
ANALYZE public.reference_workshops;
ANALYZE public.reference_activities;
ANALYZE public.reference_duties;
ANALYZE public.reference_practices;

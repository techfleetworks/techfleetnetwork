-- Fix framework_entity_v: emit singular enum values matching framework_entity_type
-- so fw_resolve_entity matches and edges land in framework_edges instead of staging.
CREATE OR REPLACE VIEW public.framework_entity_v
WITH (security_invoker = true) AS
SELECT 'activity'::text AS entity_type, id, slug, name, description, category, data, is_active, updated_at FROM reference_activities
UNION ALL SELECT 'agile_method', id, slug, name, description, category, data, is_active, updated_at FROM reference_agile_methods
UNION ALL SELECT 'company_type', id, slug, name, description, category, data, is_active, updated_at FROM reference_company_types
UNION ALL SELECT 'deliverable', id, slug, name, description, category, data, is_active, updated_at FROM reference_deliverables
UNION ALL SELECT 'duty', id, slug, name, description, category, data, is_active, updated_at FROM reference_duties
UNION ALL SELECT 'job_function', id, slug, name, description, category, data, is_active, updated_at FROM reference_job_functions
UNION ALL SELECT 'job_industry', id, slug, name, description, category, data, is_active, updated_at FROM reference_job_industries
UNION ALL SELECT 'job_specialization', id, slug, name, description, category, data, is_active, updated_at FROM reference_job_specializations
UNION ALL SELECT 'job_title', id, slug, name, description, category, data, is_active, updated_at FROM reference_job_titles
UNION ALL SELECT 'practice', id, slug, name, description, category, data, is_active, updated_at FROM reference_practices
UNION ALL SELECT 'project_milestone', id, slug, name, description, category, data, is_active, updated_at FROM reference_project_milestones
UNION ALL SELECT 'project', id, slug, name, description, category, data, is_active, updated_at FROM reference_projects
UNION ALL SELECT 'resource', id, slug, name, description, category, data, is_active, updated_at FROM reference_resources
UNION ALL SELECT 'skill', id, slug, name, description, category, data, is_active, updated_at FROM reference_skills
UNION ALL SELECT 'stakeholder', id, slug, name, description, category, data, is_active, updated_at FROM reference_stakeholders
UNION ALL SELECT 'tech_job_category', id, slug, name, description, category, data, is_active, updated_at FROM reference_tech_job_categories
UNION ALL SELECT 'tool', id, slug, name, description, category, data, is_active, updated_at FROM reference_tools
UNION ALL SELECT 'workshop', id, slug, name, description, category, data, is_active, updated_at FROM reference_workshops;

-- Replay staged edges through the resolver now that the view returns matching values.
CREATE OR REPLACE FUNCTION public.fw_replay_staging()
RETURNS TABLE(resolved bigint, remaining bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_dst uuid; v_src uuid; v_resolved bigint := 0;
BEGIN
  FOR r IN SELECT * FROM framework_edge_staging WHERE resolved_at IS NULL LOOP
    v_dst := fw_resolve_entity(r.dst_type, r.dst_name);
    v_src := fw_resolve_entity(r.src_type, r.src_name);
    IF v_dst IS NOT NULL AND v_src IS NOT NULL AND NOT (r.src_type = r.dst_type AND v_src = v_dst) THEN
      INSERT INTO framework_edges (src_type, src_id, rel_type, dst_type, dst_id, source)
      VALUES (r.src_type, v_src, r.rel_type, r.dst_type, v_dst, COALESCE(r.source,'replay'))
      ON CONFLICT ON CONSTRAINT framework_edges_unique DO NOTHING;
      UPDATE framework_edge_staging SET resolved_at = now() WHERE id = r.id;
      v_resolved := v_resolved + 1;
    END IF;
  END LOOP;
  RETURN QUERY SELECT v_resolved, (SELECT count(*) FROM framework_edge_staging WHERE resolved_at IS NULL);
END $$;

REVOKE EXECUTE ON FUNCTION public.fw_replay_staging() FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.fw_rebuild_all_edges();

CREATE OR REPLACE FUNCTION public.fw_emit_edges_for_entity(
  p_src_type framework_entity_type, p_src_id uuid, p_data jsonb, p_source text DEFAULT 'rebuild'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text; vj jsonb; n text; cnt int := 0;
  rules text[][] := ARRAY[
    ['common deliverables','requires_deliverable','deliverable'],
    ['deliverables usually not included','excludes_deliverable','deliverable'],
    ['required deliverables','produces','deliverable'],
    ['excluded deliverables','excludes_deliverable','deliverable'],
    ['deliverables','produces','deliverable'],
    ['required activities','requires_activity','activity'],
    ['activities','requires_activity','activity'],
    ['required hard skills','requires_skill','skill'],
    ['required technical and interpersonal skills','requires_skill','skill'],
    ['required skills','requires_skill','skill'],
    ['technical and interpersonal skills','requires_skill','skill'],
    ['hard skills','requires_skill','skill'],
    ['soft skills','uses_practice','practice'],
    ['team practices','uses_practice','practice'],
    ['practices','uses_practice','practice'],
    ['skills','requires_skill','skill'],
    ['tools','uses_tool','tool'],
    ['stakeholders','engages_stakeholder','stakeholder'],
    ['relevant company types','targets_company_type','company_type'],
    ['company types','targets_company_type','company_type'],
    ['duty who owns','owned_by','duty'],
    ['duties','performed_by','duty'],
    ['team functions','part_of','job_function'],
    ['job functions','part_of','job_function'],
    ['job titles','performed_by','job_title'],
    ['job industries','related_to','job_industry'],
    ['job specializations','related_to','job_specialization'],
    ['specializations','related_to','job_specialization'],
    ['tech job categories','related_to','tech_job_category'],
    ['project milestones','part_of','project_milestone'],
    ['milestones','part_of','project_milestone'],
    ['agile methods','applies_method','agile_method'],
    ['workshops','teaches_skill','workshop'],
    ['handbooks','references_resource','resource'],
    ['resources','references_resource','resource']
  ];
  i int; rk text; rrel text; rdst text;
BEGIN
  FOR k, vj IN SELECT key, value FROM jsonb_each(COALESCE(p_data,'{}'::jsonb)) LOOP
    FOR i IN 1 .. array_length(rules,1) LOOP
      rk := rules[i][1];
      IF position(rk in lower(k)) > 0 THEN
        rrel := rules[i][2]; rdst := rules[i][3];
        IF jsonb_typeof(vj) = 'array' THEN
          FOR n IN SELECT jsonb_array_elements_text(vj) LOOP
            PERFORM public.fw_upsert_edge(p_src_type, p_src_id,
              rrel::framework_rel_type, rdst::framework_entity_type, n, p_source);
            cnt := cnt + 1;
          END LOOP;
        ELSIF jsonb_typeof(vj) = 'string' THEN
          FOR n IN SELECT unnest(public.fw_split_dedupe(vj #>> '{}')) LOOP
            PERFORM public.fw_upsert_edge(p_src_type, p_src_id,
              rrel::framework_rel_type, rdst::framework_entity_type, n, p_source);
            cnt := cnt + 1;
          END LOOP;
        END IF;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN cnt;
END $$;

CREATE FUNCTION public.fw_rebuild_all_edges()
RETURNS TABLE(entity text, rows_processed bigint, edges_total bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  TRUNCATE framework_edges;
  TRUNCATE framework_edge_staging;
  FOR r IN SELECT DISTINCT entity_type FROM framework_entity_v LOOP
    PERFORM public.fw_emit_edges_for_entity(
      r.entity_type::framework_entity_type, e.id, e.data, 'rebuild'
    )
    FROM framework_entity_v e WHERE e.entity_type = r.entity_type AND e.is_active;
    entity := r.entity_type;
    rows_processed := (SELECT count(*) FROM framework_entity_v WHERE entity_type = r.entity_type AND is_active);
    edges_total := (SELECT count(*) FROM framework_edges WHERE src_type = r.entity_type::framework_entity_type);
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.fw_rebuild_all_edges() FROM anon, authenticated;
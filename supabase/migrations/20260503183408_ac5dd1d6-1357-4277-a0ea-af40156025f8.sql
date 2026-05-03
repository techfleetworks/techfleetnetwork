CREATE OR REPLACE FUNCTION public.fw_emit_edges_for_entity(
  p_src_type framework_entity_type, p_src_id uuid, p_data jsonb, p_source text DEFAULT 'rebuild'
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k text; vj jsonb; n text; cnt int := 0; lk text;
  -- Exact (case-insensitive) match table.
  rules text[][] := ARRAY[
    -- Deliverables
    ['deliverables','produces','deliverable'],
    ['required deliverables','produces','deliverable'],
    ['common deliverables','requires_deliverable','deliverable'],
    ['excluded deliverables','excludes_deliverable','deliverable'],
    ['deliverables usually not included','excludes_deliverable','deliverable'],
    ['associated deliverables','produces','deliverable'],
    -- Activities
    ['activities','requires_activity','activity'],
    ['required activities','requires_activity','activity'],
    ['activities involving the skill','requires_activity','activity'],
    -- Skills
    ['skills','requires_skill','skill'],
    ['required skills','requires_skill','skill'],
    ['hard skills','requires_skill','skill'],
    ['required hard skills','requires_skill','skill'],
    ['technical and interpersonal skills','requires_skill','skill'],
    ['required technical and interpersonal skills','requires_skill','skill'],
    ['other skills required to perform this skill','requires_skill','skill'],
    -- Practices
    ['practices','uses_practice','practice'],
    ['team practices','uses_practice','practice'],
    ['soft skills','uses_practice','practice'],
    ['practices needed to improve in this skill','uses_practice','practice'],
    -- Tools
    ['tools','uses_tool','tool'],
    -- Stakeholders
    ['stakeholders','engages_stakeholder','stakeholder'],
    -- Company types
    ['company types','targets_company_type','company_type'],
    ['relevant company types','targets_company_type','company_type'],
    -- Duties
    ['duties','performed_by','duty'],
    ['duty who owns','owned_by','duty'],
    ['duties associated with this skill','performed_by','duty'],
    -- Job functions
    ['job functions','part_of','job_function'],
    ['team functions','part_of','job_function'],
    ['job functions associated with this skill','part_of','job_function'],
    -- Job titles
    ['job titles','performed_by','job_title'],
    -- Industries / specializations / categories
    ['job industries','related_to','job_industry'],
    ['job specializations','related_to','job_specialization'],
    ['specializations','related_to','job_specialization'],
    ['tech job categories','related_to','tech_job_category'],
    -- Milestones
    ['milestones','part_of','project_milestone'],
    ['project milestones','part_of','project_milestone'],
    -- Agile
    ['agile methods','applies_method','agile_method'],
    -- Workshops
    ['workshops','teaches_skill','workshop'],
    ['masterclasses that teach the skill','teaches_skill','workshop'],
    -- Resources
    ['handbooks','references_resource','resource'],
    ['resources','references_resource','resource']
  ];
  i int; rk text; rrel text; rdst text;
BEGIN
  FOR k, vj IN SELECT key, value FROM jsonb_each(COALESCE(p_data,'{}'::jsonb)) LOOP
    lk := lower(btrim(k));
    FOR i IN 1 .. array_length(rules,1) LOOP
      rk := rules[i][1];
      IF lk = rk THEN
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
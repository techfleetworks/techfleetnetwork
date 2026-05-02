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
    EXECUTE format('DROP POLICY IF EXISTS fw_no_client_writes ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fw_no_client_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fw_no_client_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS fw_no_client_delete ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY fw_no_client_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false)',
      t
    );
    EXECUTE format(
      'CREATE POLICY fw_no_client_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false)',
      t
    );
    EXECUTE format(
      'CREATE POLICY fw_no_client_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false)',
      t
    );

    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM authenticated, anon', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS fw_rel_no_client_writes ON public.reference_relationships;
DROP POLICY IF EXISTS fw_rel_no_client_insert ON public.reference_relationships;
DROP POLICY IF EXISTS fw_rel_no_client_update ON public.reference_relationships;
DROP POLICY IF EXISTS fw_rel_no_client_delete ON public.reference_relationships;

CREATE POLICY fw_rel_no_client_insert ON public.reference_relationships
  AS RESTRICTIVE FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY fw_rel_no_client_update ON public.reference_relationships
  AS RESTRICTIVE FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY fw_rel_no_client_delete ON public.reference_relationships
  AS RESTRICTIVE FOR DELETE TO authenticated, anon USING (false);

GRANT SELECT ON public.reference_relationships TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.reference_relationships FROM authenticated, anon;
GRANT SELECT ON public.framework_entity_v TO authenticated;
GRANT SELECT ON public.framework_overview_mv TO authenticated;

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  test_type,
  status,
  notes
) VALUES (
  'RES-SP-013',
  'Resources - Skills and Practices',
  13,
  'Authenticated users can browse read-only framework records',
  $$Feature: Skills and Practices Browse visibility
  Scenario: A signed-in member opens Browse for Skills and Practices after framework data is loaded
    Given active framework records exist in reference_skills and reference_practices
    When the member opens Resources > Skills and Practices > Browse
    Then the UI [UI] displays the active skill and practice cards instead of the empty state
    And the database [DB] allows authenticated read access to active framework rows through the reference tables and framework_entity_v
    And the code/API [Code] retrieves records through the read-only reference service without attempting any client-side create, edit, or delete operation$$,
  'none',
  'not_built',
  'Covers the RLS correction where write-deny policies must not also deny reads.'
), (
  'RES-SP-014',
  'Resources - Skills and Practices',
  13,
  'Framework reference data remains UI read-only',
  $$Feature: Skills and Practices write protection
  Scenario: A signed-in admin, teacher, or member attempts to change framework reference data from the client
    Given active framework reference data exists
    When the user attempts to create, edit, or delete a framework reference record from the UI or client API
    Then the UI [UI] does not expose editing controls for framework reference records
    And the database [DB] rejects authenticated and anonymous create, edit, and delete operations on reference tables and relationships
    And the code/API [Code] only uses backend-maintenance access for manual framework data changes requested by an authorized operator$$,
  'none',
  'not_built',
  'Documents enterprise read-only access for members, admins, and teachers.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  notes = EXCLUDED.notes,
  updated_at = now();
-- Restore SELECT grants on framework reference tables for authenticated users.
-- RLS already restricts to is_active=true and blocks all client writes (RESTRICTIVE policy).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reference_skills','reference_practices','reference_activities','reference_duties',
    'reference_deliverables','reference_tools','reference_project_milestones',
    'reference_projects','reference_stakeholders','reference_job_specializations',
    'reference_job_titles','reference_resources','reference_roles',
    'reference_workshops','reference_agile_methods','reference_team_functions',
    'reference_tech_job_categories','reference_job_industries','reference_company_types',
    'reference_relationships'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated, anon', t);
    END IF;
  END LOOP;
END $$;

-- Restore SELECT on the unified views as well.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='framework_entity_v') THEN
    EXECUTE 'GRANT SELECT ON public.framework_entity_v TO authenticated, anon';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='framework_overview_v') THEN
    EXECUTE 'GRANT SELECT ON public.framework_overview_v TO authenticated, anon';
  END IF;
END $$;
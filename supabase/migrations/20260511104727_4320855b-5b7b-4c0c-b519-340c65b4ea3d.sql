
-- 1) Add description provenance columns to all reference_* tables that carry descriptions
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'reference_workshops','reference_stakeholders','reference_skills','reference_tools',
    'reference_practices','reference_activities','reference_deliverables','reference_duties',
    'reference_resources','reference_projects','reference_project_milestones','reference_relationships',
    'reference_company_types','reference_agile_methods','reference_job_functions','reference_job_industries',
    'reference_job_specializations','reference_job_titles','reference_tech_job_categories'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS description_source text NOT NULL DEFAULT ''csv'',
        ADD COLUMN IF NOT EXISTS description_generated_at timestamptz',
      t
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (description_source)',
      t || '_desc_source_idx', t
    );
  END LOOP;
END $$;

-- 2) Delete 17 leaked category-label rows from reference_skills
DELETE FROM public.reference_skills
WHERE name IN (
  'Activity','Company Type','Deliverable','Duty','Industry','Job Function',
  'Methodology','Practices','Product Milestone','Project','Resource','Skills',
  'Specialization','Stakeholder','Tech Job Category','Tool','Workshop'
);

-- 3) Trigger to reject re-insertion of leaked category labels into reference_skills
CREATE OR REPLACE FUNCTION public.block_skills_category_labels()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name = ANY (ARRAY[
    'Activity','Company Type','Deliverable','Duty','Industry','Job Function',
    'Methodology','Practices','Product Milestone','Project','Resource','Skills',
    'Specialization','Stakeholder','Tech Job Category','Tool','Workshop'
  ]) THEN
    RAISE NOTICE 'Skipping reserved category label "%" in reference_skills', NEW.name;
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_skills_category_labels ON public.reference_skills;
CREATE TRIGGER trg_block_skills_category_labels
BEFORE INSERT ON public.reference_skills
FOR EACH ROW EXECUTE FUNCTION public.block_skills_category_labels();


-- ============================================================
-- 1) Career Plan tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.career_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  target_job_title_id uuid REFERENCES public.reference_job_titles(id) ON DELETE SET NULL,
  target_specialization_id uuid REFERENCES public.reference_job_specializations(id) ON DELETE SET NULL,
  target_role_id uuid REFERENCES public.reference_roles(id) ON DELETE SET NULL,
  current_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_practices jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.career_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own career plan"
  ON public.career_plans FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own career plan"
  ON public.career_plans FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own career plan"
  ON public.career_plans FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own career plan"
  ON public.career_plans FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all career plans"
  ON public.career_plans FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_career_plans_updated_at
  BEFORE UPDATE ON public.career_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----- career_plan_items -----

CREATE TABLE IF NOT EXISTS public.career_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.career_plans(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('skill','practice','activity','deliverable','milestone','resource','duty')),
  reference_id uuid NOT NULL,
  priority int NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','done')),
  auto_generated boolean NOT NULL DEFAULT true,
  rationale text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, item_type, reference_id)
);

CREATE INDEX IF NOT EXISTS idx_career_plan_items_plan ON public.career_plan_items(plan_id);

ALTER TABLE public.career_plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own plan items"
  ON public.career_plan_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM career_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Users insert own plan items"
  ON public.career_plan_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM career_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Users update own plan items"
  ON public.career_plan_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM career_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Users delete own plan items"
  ON public.career_plan_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM career_plans p WHERE p.id = plan_id AND p.user_id = auth.uid()));
CREATE POLICY "Admins view all plan items"
  ON public.career_plan_items FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_career_plan_items_updated_at
  BEFORE UPDATE ON public.career_plan_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) Framework → knowledge_base projection
-- ============================================================

-- Allow service-role / SECURITY DEFINER writes to knowledge_base.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='knowledge_base' AND policyname='Service role manages framework KB'
  ) THEN
    CREATE POLICY "Service role manages framework KB"
      ON public.knowledge_base FOR ALL TO public
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Helper: slugify a name for stable URLs.
CREATE OR REPLACE FUNCTION public.fw_slug(input text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(coalesce(input,''), '[^a-zA-Z0-9]+', '-', 'g'))
$$;

-- Friendly entity label for KB titles (mirrors FRAMEWORK_LABELS in code).
CREATE OR REPLACE FUNCTION public.fw_label(entity text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE entity
    WHEN 'skills' THEN 'Technical & Interpersonal Skill'
    WHEN 'practices' THEN 'Team Practice'
    WHEN 'activities' THEN 'Activity'
    WHEN 'duties' THEN 'Job Duty'
    WHEN 'deliverables' THEN 'Deliverable'
    WHEN 'tools' THEN 'Tool'
    WHEN 'project_milestones' THEN 'Project Milestone'
    WHEN 'projects' THEN 'Project'
    WHEN 'stakeholders' THEN 'Stakeholder'
    WHEN 'specializations' THEN 'Specialization'
    WHEN 'job_titles' THEN 'Job Title'
    WHEN 'resources' THEN 'Resource'
    WHEN 'roles' THEN 'Role'
    ELSE initcap(replace(entity,'_',' '))
  END
$$;

-- Map entity key -> reference table (handles specializations alias).
CREATE OR REPLACE FUNCTION public.fw_table(entity text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'reference_' || CASE entity
    WHEN 'specializations' THEN 'job_specializations'
    ELSE entity
  END
$$;

-- Build the KB content for a single reference item.
CREATE OR REPLACE FUNCTION public.fw_build_entity_content(
  p_entity text, p_name text, p_description text
) RETURNS text LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  rel_lines text;
BEGIN
  SELECT string_agg(
    '- ' || fw_label(r.from_entity) || ' → ' || fw_label(r.to_entity) || ': ' || r.description,
    E'\n'
  ) INTO rel_lines
  FROM reference_relationships r
  WHERE r.from_entity = p_entity OR r.to_entity = p_entity;

  RETURN
    fw_label(p_entity) || ': ' || coalesce(p_name,'') || E'\n\n' ||
    coalesce(p_description,'') || E'\n\n' ||
    'How this relates to other framework concepts:' || E'\n' ||
    coalesce(rel_lines, '(no relationships recorded)');
END;
$$;

-- Generic upsert helpers.
CREATE OR REPLACE FUNCTION public.fw_upsert_kb(
  p_url text, p_title text, p_content text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO knowledge_base (url, title, content, scraped_at, created_at)
  VALUES (p_url, p_title, p_content, now(), now())
  ON CONFLICT (url) DO UPDATE
    SET title = EXCLUDED.title,
        content = EXCLUDED.content,
        scraped_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.fw_delete_kb(p_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM knowledge_base WHERE url = p_url;
END;
$$;

-- knowledge_base.url uniqueness needed for ON CONFLICT.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_base_url_key'
  ) THEN
    -- De-dupe first to avoid constraint failure.
    DELETE FROM knowledge_base a USING knowledge_base b
      WHERE a.ctid < b.ctid AND a.url = b.url;
    ALTER TABLE knowledge_base ADD CONSTRAINT knowledge_base_url_key UNIQUE (url);
  END IF;
END $$;

-- Trigger: reference_<entity> INSERT/UPDATE/DELETE → KB upsert/delete.
CREATE OR REPLACE FUNCTION public.tg_sync_reference_to_kb()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_url text;
  v_title text;
  v_content text;
  v_name text;
  v_description text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_url := 'framework://entity/' || v_entity || '/' || OLD.id::text;
    PERFORM fw_delete_kb(v_url);
    RETURN OLD;
  END IF;

  v_name := COALESCE(NEW.name, '');
  v_description := COALESCE(NEW.description, '');
  v_url := 'framework://entity/' || v_entity || '/' || NEW.id::text;
  v_title := fw_label(v_entity) || ': ' || v_name;
  v_content := fw_build_entity_content(v_entity, v_name, v_description);
  PERFORM fw_upsert_kb(v_url, v_title, v_content);
  RETURN NEW;
END;
$$;

-- Trigger: reference_relationships INSERT/UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.tg_sync_relationship_to_kb()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_title text;
  v_content text;
  v_alts text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_url := 'framework://relationship/' || OLD.from_entity || '/' || OLD.to_entity;
    PERFORM fw_delete_kb(v_url);
    RETURN OLD;
  END IF;

  v_url := 'framework://relationship/' || NEW.from_entity || '/' || NEW.to_entity;
  v_title := fw_label(NEW.from_entity) || ' → ' || fw_label(NEW.to_entity);

  IF NEW.all_descriptions IS NOT NULL AND jsonb_typeof(NEW.all_descriptions) = 'array' THEN
    SELECT string_agg('- ' || (elem #>> '{}'), E'\n')
      INTO v_alts
      FROM jsonb_array_elements(NEW.all_descriptions) elem;
  END IF;

  v_content :=
    'Forward: ' || coalesce(NEW.description,'(none)') || E'\n' ||
    'Inverse: ' || coalesce(NEW.inverse_description,'(none)') || E'\n\n' ||
    'Alternate phrasings:' || E'\n' || coalesce(v_alts, '(none)');
  PERFORM fw_upsert_kb(v_url, v_title, v_content);
  RETURN NEW;
END;
$$;

-- Attach triggers to all 14 reference_* tables.
DO $$
DECLARE
  pair record;
BEGIN
  FOR pair IN SELECT * FROM (VALUES
    ('skills','reference_skills'),
    ('practices','reference_practices'),
    ('activities','reference_activities'),
    ('duties','reference_duties'),
    ('deliverables','reference_deliverables'),
    ('tools','reference_tools'),
    ('project_milestones','reference_project_milestones'),
    ('projects','reference_projects'),
    ('stakeholders','reference_stakeholders'),
    ('specializations','reference_job_specializations'),
    ('job_titles','reference_job_titles'),
    ('resources','reference_resources'),
    ('roles','reference_roles')
  ) AS t(entity, tbl)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_fw_kb_sync ON public.%I', pair.tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_fw_kb_sync AFTER INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.tg_sync_reference_to_kb(%L)',
      pair.tbl, pair.entity
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS trg_fw_kb_sync_relationships ON public.reference_relationships;
CREATE TRIGGER trg_fw_kb_sync_relationships
  AFTER INSERT OR UPDATE OR DELETE ON public.reference_relationships
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_relationship_to_kb();

-- ============================================================
-- 3) One-time backfill of all existing rows
-- ============================================================

-- Wipe any prior framework:// rows so backfill is clean.
DELETE FROM public.knowledge_base WHERE url LIKE 'framework://%';

-- Entities
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/skills/' || id::text,
       fw_label('skills') || ': ' || name,
       fw_build_entity_content('skills', name, description),
       now(), now()
FROM reference_skills;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/practices/' || id::text,
       fw_label('practices') || ': ' || name,
       fw_build_entity_content('practices', name, description),
       now(), now()
FROM reference_practices;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/activities/' || id::text,
       fw_label('activities') || ': ' || name,
       fw_build_entity_content('activities', name, description),
       now(), now()
FROM reference_activities;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/duties/' || id::text,
       fw_label('duties') || ': ' || name,
       fw_build_entity_content('duties', name, description),
       now(), now()
FROM reference_duties;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/deliverables/' || id::text,
       fw_label('deliverables') || ': ' || name,
       fw_build_entity_content('deliverables', name, description),
       now(), now()
FROM reference_deliverables;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/tools/' || id::text,
       fw_label('tools') || ': ' || name,
       fw_build_entity_content('tools', name, description),
       now(), now()
FROM reference_tools;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/project_milestones/' || id::text,
       fw_label('project_milestones') || ': ' || name,
       fw_build_entity_content('project_milestones', name, description),
       now(), now()
FROM reference_project_milestones;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/projects/' || id::text,
       fw_label('projects') || ': ' || name,
       fw_build_entity_content('projects', name, description),
       now(), now()
FROM reference_projects;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/stakeholders/' || id::text,
       fw_label('stakeholders') || ': ' || name,
       fw_build_entity_content('stakeholders', name, description),
       now(), now()
FROM reference_stakeholders;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/specializations/' || id::text,
       fw_label('specializations') || ': ' || name,
       fw_build_entity_content('specializations', name, description),
       now(), now()
FROM reference_job_specializations;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/job_titles/' || id::text,
       fw_label('job_titles') || ': ' || name,
       fw_build_entity_content('job_titles', name, description),
       now(), now()
FROM reference_job_titles;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/resources/' || id::text,
       fw_label('resources') || ': ' || name,
       fw_build_entity_content('resources', name, description),
       now(), now()
FROM reference_resources;
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT 'framework://entity/roles/' || id::text,
       fw_label('roles') || ': ' || name,
       fw_build_entity_content('roles', name, description),
       now(), now()
FROM reference_roles;

-- Relationships
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
SELECT
  'framework://relationship/' || from_entity || '/' || to_entity,
  fw_label(from_entity) || ' → ' || fw_label(to_entity),
  'Forward: ' || coalesce(description,'(none)') || E'\n' ||
  'Inverse: ' || coalesce(inverse_description,'(none)') || E'\n\n' ||
  'Alternate phrasings:' || E'\n' || coalesce(
    (SELECT string_agg('- ' || (elem #>> '{}'), E'\n')
     FROM jsonb_array_elements(all_descriptions) elem),
    '(none)'
  ),
  now(), now()
FROM reference_relationships
WHERE is_active = true;

-- Overview row
INSERT INTO public.knowledge_base (url, title, content, scraped_at, created_at)
VALUES (
  'framework://overview',
  'Tech Fleet Skills & Practices Framework — Overview',
  'The Tech Fleet Skills & Practices Framework connects 13 concepts that describe how members learn, work, and grow:' || E'\n\n' ||
  '- Technical & Interpersonal Skills — measured ability in expertise (technical) or interaction with others (interpersonal).' || E'\n' ||
  '- Team Practices — beliefs and behaviors that affect successful teamwork on empowered teams.' || E'\n' ||
  '- Activities — what teams do to complete work.' || E'\n' ||
  '- Job Duties — expected responsibilities associated with a job title.' || E'\n' ||
  '- Deliverables — something provided as a result of a process.' || E'\n' ||
  '- Tools — physical or digital objects used to complete work.' || E'\n' ||
  '- Project Milestones — measured outcomes of work progress.' || E'\n' ||
  '- Projects — work outcomes that meet agreed-to goals.' || E'\n' ||
  '- Stakeholders — people who drive the needs of work.' || E'\n' ||
  '- Specializations — areas of competency and expertise.' || E'\n' ||
  '- Job Titles — labels used to describe responsibilities at a company.' || E'\n' ||
  '- Resources — people who contribute to the success of the work.' || E'\n' ||
  '- Roles — sets of expected duties on a team.',
  now(), now()
);

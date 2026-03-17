
-- Enums for projects
CREATE TYPE public.project_type AS ENUM (
  'website_design', 'service_design', 'application_design', 'strategy', 'discovery'
);

CREATE TYPE public.project_phase AS ENUM (
  'phase_1', 'phase_2', 'phase_3', 'phase_4'
);

CREATE TYPE public.project_status_enum AS ENUM (
  'coming_soon', 'apply_now', 'recruiting', 'team_onboarding', 'project_in_progress', 'project_complete'
);

-- Projects table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_type public.project_type NOT NULL,
  phase public.project_phase NOT NULL DEFAULT 'phase_1',
  team_hats text[] NOT NULL DEFAULT '{}',
  project_status public.project_status_enum NOT NULL DEFAULT 'coming_soon',
  current_phase_milestones text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Milestone reference table
CREATE TABLE public.milestone_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_name text NOT NULL UNIQUE,
  deliverables text[] NOT NULL DEFAULT '{}',
  activities text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Updated_at trigger for projects
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for projects (admin only)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all projects" ON public.projects
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete projects" ON public.projects
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for milestone_reference (authenticated read)
ALTER TABLE public.milestone_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view milestone reference" ON public.milestone_reference
  FOR SELECT TO authenticated
  USING (true);

-- Audit trigger for projects
CREATE OR REPLACE FUNCTION public.audit_project_changes()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('project_created', 'projects', NEW.id::text, NEW.created_by, ARRAY[NEW.project_type::text, NEW.phase::text]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('project_updated', 'projects', NEW.id::text, NEW.created_by, ARRAY[NEW.project_type::text, NEW.project_status::text]);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('project_deleted', 'projects', OLD.id::text, OLD.created_by, ARRAY[OLD.project_type::text]);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_project_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_project_changes();

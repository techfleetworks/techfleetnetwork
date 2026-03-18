-- Project applications table
CREATE TABLE public.project_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  current_step integer NOT NULL DEFAULT 1,

  -- Step 2: Project Questions
  team_hats_interest text[] NOT NULL DEFAULT '{}',
  participated_previous_phase boolean NOT NULL DEFAULT false,
  previous_phase_position text NOT NULL DEFAULT '',
  previous_phase_learnings text NOT NULL DEFAULT '',
  previous_phase_help_teammates text NOT NULL DEFAULT '',
  prior_engagement_preparation text NOT NULL DEFAULT '',

  -- Step 3: Client Questions
  passion_for_project text NOT NULL DEFAULT '',
  client_project_knowledge text NOT NULL DEFAULT '',
  cross_functional_contribution text NOT NULL DEFAULT '',
  project_success_contribution text NOT NULL DEFAULT '',

  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, project_id)
);

ALTER TABLE public.project_applications ENABLE ROW LEVEL SECURITY;

-- Users can CRUD their own applications
CREATE POLICY "Users can view own project applications"
  ON public.project_applications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own project applications"
  ON public.project_applications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own project applications"
  ON public.project_applications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all project applications"
  ON public.project_applications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER set_project_applications_updated_at
  BEFORE UPDATE ON public.project_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_project_application()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('project_application_created', 'project_applications', NEW.id::text, NEW.user_id, ARRAY[NEW.status]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES ('project_application_status_changed', 'project_applications', NEW.id::text, NEW.user_id, ARRAY[OLD.status, NEW.status]);
    END IF;
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES ('project_application_submitted', 'project_applications', NEW.id::text, NEW.user_id, ARRAY['completed']);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_project_application_trigger
  AFTER INSERT OR UPDATE ON public.project_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_application();
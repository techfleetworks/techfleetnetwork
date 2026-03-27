
-- Create project_certifications table mirroring class_certifications
CREATE TABLE public.project_certifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  airtable_record_id text NOT NULL,
  email text NOT NULL DEFAULT ''::text,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, airtable_record_id)
);

-- Enable RLS
ALTER TABLE public.project_certifications ENABLE ROW LEVEL SECURITY;

-- Users can view own certifications
CREATE POLICY "Users can view own project certifications"
  ON public.project_certifications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role can manage
CREATE POLICY "Service role can manage project certifications"
  ON public.project_certifications
  FOR ALL
  TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_project_certification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('project_certification_synced', 'project_certifications', NEW.id::text, NEW.user_id, ARRAY[NEW.airtable_record_id]);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_project_certification
  AFTER INSERT ON public.project_certifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_project_certification();

-- Updated_at trigger
CREATE TRIGGER update_project_certifications_updated_at
  BEFORE UPDATE ON public.project_certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

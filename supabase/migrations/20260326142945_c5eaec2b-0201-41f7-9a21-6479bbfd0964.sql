
-- Table to cache Airtable Masterclass Registration records per user
CREATE TABLE public.class_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  airtable_record_id text NOT NULL,
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, airtable_record_id)
);

-- RLS
ALTER TABLE public.class_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own certifications"
  ON public.class_certifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage certifications"
  ON public.class_certifications FOR ALL
  TO public
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

-- updated_at trigger
CREATE TRIGGER update_class_certifications_updated_at
  BEFORE UPDATE ON public.class_certifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_class_certification()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('certification_synced', 'class_certifications', NEW.id::text, NEW.user_id, ARRAY[NEW.airtable_record_id]);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_class_certification_trigger
  AFTER INSERT ON public.class_certifications
  FOR EACH ROW EXECUTE FUNCTION public.audit_class_certification();


-- Project Roster table for historical and ongoing team member assignments
CREATE TABLE public.project_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  airtable_record_id text UNIQUE NOT NULL,
  
  -- Member info
  member_name text NOT NULL DEFAULT '',
  member_email text NOT NULL DEFAULT '',
  member_role text NOT NULL DEFAULT '',
  
  -- Project info
  project_name text NOT NULL DEFAULT '',
  client_name text NOT NULL DEFAULT '',
  phase text NOT NULL DEFAULT '',
  project_type text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  
  -- Dates
  start_date date,
  end_date date,
  
  -- Extended details
  hours_contributed numeric DEFAULT 0,
  performance_notes text NOT NULL DEFAULT '',
  mentor text NOT NULL DEFAULT '',
  
  -- Linked record references (stored as text from Airtable)
  linked_project_ids text[] NOT NULL DEFAULT '{}',
  
  -- Optional FK to existing projects table
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  
  -- Metadata
  raw_airtable_data jsonb DEFAULT '{}',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_project_roster_member_email ON public.project_roster(member_email);
CREATE INDEX idx_project_roster_project_name ON public.project_roster(project_name);
CREATE INDEX idx_project_roster_airtable_id ON public.project_roster(airtable_record_id);

-- Enable RLS
ALTER TABLE public.project_roster ENABLE ROW LEVEL SECURITY;

-- RLS policies: admins full access, authenticated users read-only
CREATE POLICY "Admins can manage roster"
  ON public.project_roster FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view roster"
  ON public.project_roster FOR SELECT
  TO authenticated
  USING (true);

-- Auto-update updated_at
CREATE TRIGGER update_project_roster_updated_at
  BEFORE UPDATE ON public.project_roster
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Audit trigger
CREATE OR REPLACE FUNCTION public.audit_project_roster()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('roster_entry_created', 'project_roster', NEW.id::text, NULL, ARRAY[NEW.member_name, NEW.project_name]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('roster_entry_updated', 'project_roster', NEW.id::text, NULL, ARRAY[NEW.member_name, NEW.status]);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('roster_entry_deleted', 'project_roster', OLD.id::text, NULL, ARRAY[OLD.member_name, OLD.project_name]);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER audit_project_roster_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.project_roster
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_project_roster();

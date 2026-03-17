
-- Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read announcements
CREATE POLICY "Authenticated users can view announcements"
  ON public.announcements FOR SELECT TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert announcements"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete announcements"
  ON public.announcements FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update
CREATE POLICY "Admins can update announcements"
  ON public.announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE TRIGGER set_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for ordering by date
CREATE INDEX idx_announcements_created_at ON public.announcements (created_at DESC);

-- Add notify_announcements to profiles (default false)
ALTER TABLE public.profiles ADD COLUMN notify_announcements boolean NOT NULL DEFAULT false;

-- Audit trigger for announcements
CREATE OR REPLACE FUNCTION public.audit_announcement()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('announcement_created', 'announcements', NEW.id::text, NEW.created_by, ARRAY[NEW.title]);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('announcement_deleted', 'announcements', OLD.id::text, OLD.created_by, ARRAY[OLD.title]);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_announcement
  AFTER INSERT OR DELETE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.audit_announcement();

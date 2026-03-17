
-- Add error_message column to audit_log for tracking system errors
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS error_message text DEFAULT NULL;

-- Add RLS policy so admins can view all audit logs
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);

-- Add index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON public.audit_log (user_id);

-- Update write_audit_log function to support error_message parameter
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_event_type text,
  p_table_name text,
  p_record_id text,
  p_user_id uuid,
  p_changed_fields text[] DEFAULT NULL::text[],
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields, error_message)
  VALUES (p_event_type, p_table_name, p_record_id, p_user_id, p_changed_fields, p_error_message);
END;
$$;

-- Add audit triggers for journey_progress changes
CREATE OR REPLACE FUNCTION public.audit_journey_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('task_completed', 'journey_progress', NEW.id::text, NEW.user_id, ARRAY[NEW.phase::text, NEW.task_id]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.completed IS DISTINCT FROM OLD.completed THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES (
        CASE WHEN NEW.completed THEN 'task_completed' ELSE 'task_uncompleted' END,
        'journey_progress', NEW.id::text, NEW.user_id, ARRAY[NEW.phase::text, NEW.task_id]
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_journey_progress
  AFTER INSERT OR UPDATE ON public.journey_progress
  FOR EACH ROW EXECUTE FUNCTION public.audit_journey_progress();

-- Add audit trigger for general_applications
CREATE OR REPLACE FUNCTION public.audit_general_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('application_created', 'general_applications', NEW.id::text, NEW.user_id, ARRAY[NEW.status]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES ('application_status_changed', 'general_applications', NEW.id::text, NEW.user_id, ARRAY[OLD.status, NEW.status]);
    END IF;
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES ('application_submitted', 'general_applications', NEW.id::text, NEW.user_id, ARRAY['completed']);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_general_application
  AFTER INSERT OR UPDATE ON public.general_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_general_application();

-- Add audit trigger for chat conversations
CREATE OR REPLACE FUNCTION public.audit_chat_conversation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('conversation_created', 'chat_conversations', NEW.id::text, NEW.user_id, ARRAY[NEW.title]);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('conversation_deleted', 'chat_conversations', OLD.id::text, OLD.user_id, ARRAY[OLD.title]);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_chat_conversation
  AFTER INSERT OR DELETE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.audit_chat_conversation();

-- Add audit trigger for invitations
CREATE OR REPLACE FUNCTION public.audit_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('invitation_created', 'invitations', NEW.id::text, NEW.invited_by, ARRAY[NEW.email]);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.used_at IS NOT NULL AND OLD.used_at IS NULL THEN
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES ('invitation_used', 'invitations', NEW.id::text, NEW.invited_by, ARRAY[NEW.email]);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_invitation
  AFTER INSERT OR UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_invitation();

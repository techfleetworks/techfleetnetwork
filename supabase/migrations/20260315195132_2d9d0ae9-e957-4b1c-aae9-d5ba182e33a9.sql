
-- HIPAA/ISO: Audit log table for tracking all PII access and modifications
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,           -- 'profile_created','profile_updated','profile_viewed','auth_signin','auth_signout'
  table_name text NOT NULL,
  record_id text,                     -- ID of affected record (NOT the user_id for privacy)
  user_id uuid,                       -- Who performed the action
  ip_address text,                    -- Redacted after retention period
  changed_fields text[],              -- Which columns changed (no values stored)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: No direct access — only SECURITY DEFINER functions can write
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read audit logs (future role-based access)
-- No public/authenticated read policy — logs are admin-only

-- SECURITY DEFINER function to write audit entries (no direct table access)
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_event_type text,
  p_table_name text,
  p_record_id text,
  p_user_id uuid,
  p_changed_fields text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
  VALUES (p_event_type, p_table_name, p_record_id, p_user_id, p_changed_fields);
END;
$$;

-- Trigger: automatically log all profile changes (HIPAA requirement for PII audit trail)
CREATE OR REPLACE FUNCTION public.audit_profile_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_changed text[] := '{}';
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'profile_created';
    v_changed := ARRAY['first_name','last_name','country','discord_username','display_name'];
    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
    VALUES (v_event, 'profiles', NEW.id::text, NEW.user_id, v_changed);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event := 'profile_updated';
    IF NEW.first_name IS DISTINCT FROM OLD.first_name THEN v_changed := array_append(v_changed, 'first_name'); END IF;
    IF NEW.last_name IS DISTINCT FROM OLD.last_name THEN v_changed := array_append(v_changed, 'last_name'); END IF;
    IF NEW.country IS DISTINCT FROM OLD.country THEN v_changed := array_append(v_changed, 'country'); END IF;
    IF NEW.discord_username IS DISTINCT FROM OLD.discord_username THEN v_changed := array_append(v_changed, 'discord_username'); END IF;
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN v_changed := array_append(v_changed, 'display_name'); END IF;
    IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN v_changed := array_append(v_changed, 'avatar_url'); END IF;
    IF NEW.bio IS DISTINCT FROM OLD.bio THEN v_changed := array_append(v_changed, 'bio'); END IF;
    IF NEW.professional_background IS DISTINCT FROM OLD.professional_background THEN v_changed := array_append(v_changed, 'professional_background'); END IF;
    -- Only log if something actually changed
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, changed_fields)
      VALUES (v_event, 'profiles', NEW.id::text, NEW.user_id, v_changed);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- Data retention: function to purge audit logs older than retention period (default 7 years for HIPAA)
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs(retention_days int DEFAULT 2555)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.audit_log
  WHERE created_at < now() - (retention_days || ' days')::interval;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

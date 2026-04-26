ALTER TABLE public.audit_log
ADD COLUMN IF NOT EXISTS actor_email text;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_email
ON public.audit_log (actor_email)
WHERE actor_email IS NOT NULL;

CREATE OR REPLACE FUNCTION public.audit_public_table_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_old_row jsonb;
  v_record_id text;
  v_user_id uuid;
  v_actor_email text;
  v_changed_fields text[];
  v_event_type text;
BEGIN
  IF TG_TABLE_NAME = 'audit_log' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_row := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_old_row := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_record_id := COALESCE(v_row->>'id', v_row->>'user_id');
  v_user_id := auth.uid();
  v_actor_email := NULLIF(auth.jwt() ->> 'email', '');

  IF v_user_id IS NULL AND COALESCE(v_row->>'user_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_id := (v_row->>'user_id')::uuid;
  END IF;

  IF v_actor_email IS NULL AND COALESCE(v_row->>'email', '') <> '' THEN
    v_actor_email := v_row->>'email';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(array_agg(key ORDER BY key), ARRAY['updated']::text[])
    INTO v_changed_fields
    FROM jsonb_each(v_row) AS n(key, value)
    WHERE n.value IS DISTINCT FROM (v_old_row -> n.key)
      AND n.key NOT IN ('updated_at', 'created_at');

    IF v_changed_fields IS NULL OR array_length(v_changed_fields, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    v_changed_fields := ARRAY['created'];
  ELSE
    v_changed_fields := ARRAY['deleted'];
  END IF;

  v_event_type := TG_TABLE_NAME || '_' || lower(TG_OP);

  INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, actor_email, changed_fields, error_message)
  VALUES (v_event_type, TG_TABLE_NAME, v_record_id, v_user_id, v_actor_email, v_changed_fields, NULL);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;
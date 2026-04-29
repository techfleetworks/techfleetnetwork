-- Prevent users from reading sensitive roster fields directly from the base table.
DROP POLICY IF EXISTS "Members can view own roster entries" ON public.project_roster;
DROP POLICY IF EXISTS "Users can view own roster entries" ON public.project_roster;
DROP POLICY IF EXISTS "Users can view own roster entries via view" ON public.project_roster;
DROP POLICY IF EXISTS "Users can view own roster entries securely" ON public.project_roster;

-- Keep the member-facing roster surface safe, scoped to the immutable auth email claim, and compatible with existing view consumers.
CREATE OR REPLACE VIEW public.project_roster_member_view AS
SELECT
  pr.id,
  pr.airtable_record_id,
  pr.member_name,
  ''::text AS member_email,
  pr.member_role,
  pr.project_name,
  pr.client_name,
  pr.phase,
  pr.project_type,
  pr.status,
  pr.start_date,
  pr.end_date,
  pr.linked_project_ids,
  pr.project_id,
  pr.synced_at,
  pr.created_at,
  pr.updated_at
FROM public.project_roster pr
WHERE lower(pr.member_email) = lower(NULLIF(auth.jwt() ->> 'email', ''));

ALTER VIEW public.project_roster_member_view OWNER TO postgres;
REVOKE ALL ON public.project_roster_member_view FROM PUBLIC, anon;
GRANT SELECT ON public.project_roster_member_view TO authenticated;

-- Guard audit integrity: non-service callers can only create audit rows through the validated RPC path.
CREATE OR REPLACE FUNCTION public.enforce_audit_log_insert_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF current_setting('app.audit_log_context', true) = 'write_audit_log' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Audit log entries must be written through the validated audit logger';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_audit_log_insert_context() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_audit_log_insert_context_trigger ON public.audit_log;
CREATE TRIGGER enforce_audit_log_insert_context_trigger
BEFORE INSERT ON public.audit_log
FOR EACH ROW
EXECUTE FUNCTION public.enforce_audit_log_insert_context();

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_event_type text,
  p_table_name text,
  p_record_id text,
  p_user_id uuid,
  p_changed_fields text[] DEFAULT NULL::text[],
  p_error_message text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_actor_email text;
  v_effective_user_id uuid;
  v_changed_fields text[];
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cannot write audit events for another user';
    END IF;

    v_effective_user_id := auth.uid();
  ELSE
    v_effective_user_id := p_user_id;
  END IF;

  IF p_event_type IS NULL OR p_event_type !~ '^[a-z][a-z0-9_:-]{2,80}$' THEN
    RAISE EXCEPTION 'Invalid audit event type';
  END IF;

  IF p_table_name IS NULL OR p_table_name !~ '^[a-z][a-z0-9_]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid audit table name';
  END IF;

  IF p_record_id IS NOT NULL AND length(p_record_id) > 200 THEN
    RAISE EXCEPTION 'Invalid audit record identifier';
  END IF;

  IF p_changed_fields IS NOT NULL THEN
    IF cardinality(p_changed_fields) > 50 THEN
      RAISE EXCEPTION 'Too many audit changed fields';
    END IF;

    SELECT array_agg(left(field_value, 100))
    INTO v_changed_fields
    FROM unnest(p_changed_fields) AS field_value
    WHERE field_value IS NOT NULL AND field_value ~ '^[A-Za-z0-9_.:-]{1,100}$';
  END IF;

  v_actor_email := NULLIF(auth.jwt() ->> 'email', '');

  IF v_actor_email IS NULL AND v_effective_user_id IS NOT NULL THEN
    SELECT NULLIF(email, '')
    INTO v_actor_email
    FROM public.profiles
    WHERE user_id = v_effective_user_id
    LIMIT 1;
  END IF;

  PERFORM set_config('app.audit_log_context', 'write_audit_log', true);

  INSERT INTO public.audit_log (
    event_type,
    table_name,
    record_id,
    user_id,
    actor_email,
    changed_fields,
    error_message
  ) VALUES (
    p_event_type,
    p_table_name,
    left(COALESCE(p_record_id, ''), 200),
    v_effective_user_id,
    v_actor_email,
    v_changed_fields,
    left(public.redact_sensitive_text(p_error_message), 1000)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_event_type text,
  p_table_name text,
  p_record_id text,
  p_user_id uuid,
  p_changed_fields text[] DEFAULT NULL::text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM public.write_audit_log(
    p_event_type,
    p_table_name,
    p_record_id,
    p_user_id,
    p_changed_fields,
    NULL::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) TO authenticated, service_role;
-- OWASP A01 Broken Access Control / A09 Logging: remove elevated execution from user-callable audit helpers.
-- Authenticated users may create only audit rows tied to their own account; service role retains backend automation access.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audit_log'
      AND policyname = 'Users can create own audit events'
  ) THEN
    CREATE POLICY "Users can create own audit events"
    ON public.audit_log
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

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
 SET search_path TO 'public'
AS $function$
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
$function$;

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
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.log_pii_access(p_accessed_user_id uuid, p_access_reason text DEFAULT 'admin_view'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF auth.uid() <> p_accessed_user_id
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized to log PII access for this user';
  END IF;

  IF p_accessed_user_id IS NULL THEN
    RAISE EXCEPTION 'Missing accessed user';
  END IF;

  v_reason := left(COALESCE(NULLIF(regexp_replace(p_access_reason, '[^A-Za-z0-9_.:-]', '', 'g'), ''), 'admin_view'), 80);

  PERFORM public.write_audit_log(
    'pii_access',
    'profiles',
    p_accessed_user_id::text,
    auth.uid(),
    ARRAY[v_reason]
  );
END;
$function$;

INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area,
  feature_area_number,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
) VALUES (
  'SEC-AUDIT-INVOKER-015',
  'Security: OWASP Audit Logging Least Privilege',
  15,
  'Audit logging helpers run with caller permissions',
  'Feature: OWASP A01 and A09 audit helper least privilege
  As a platform security reviewer
  I want user-callable audit helpers to run with caller permissions
  So that audit logging does not require unnecessary elevated execution

  Scenario: Users can create only their own audit events
    Given a signed-in user
    When the user writes an audit event for their own account
    Then the event is stored with sanitized fields and redacted error text

  Scenario: Users cannot forge audit events for another user
    Given a signed-in non-admin user
    When the user tries to write an audit event for another account
    Then the database denies the request before writing a row

  Scenario: PII access logging remains authorized and sanitized
    Given a signed-in user or admin
    When PII access is logged
    Then the reason is sanitized and the audit row is created only under the caller-scoped rules',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  'supabase/migrations/2026042914_audit_invoker_least_privilege.sql',
  'Covers OWASP A01/A09 conversion of write_audit_log and log_pii_access from SECURITY DEFINER to SECURITY INVOKER with self-scoped audit insert RLS.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
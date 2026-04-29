-- OWASP A01/A04/A09 hardening: prevent client-side audit log forgery while preserving telemetry.

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
SECURITY DEFINER
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
SECURITY DEFINER
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

REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) TO authenticated, service_role;

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
  'SEC-AUDIT-INTEGRITY-006',
  'Security hardening',
  90,
  'Authenticated users cannot forge audit events for other users',
  'Feature: Audit log integrity\n  Scenario: Signed-in users submit client-side security telemetry\n    Given a signed-in user can record their own security telemetry\n    When they attempt to write an audit event for another user or with malformed event metadata\n    Then the database rejects the forged audit event\n    And valid own-user telemetry is redacted, bounded, and stored without exposing secrets',
  'implemented',
  'manual',
  'supabase/migrations/current_audit_log_integrity.sql',
  'OWASP A01/A04/A09 guard for audit integrity, input validation, and sensitive-data redaction.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
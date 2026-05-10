-- Fix audit logging permission failures from client-side health triage reports.
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
SET search_path TO 'public', 'extensions', 'pg_temp'
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
SET search_path TO 'public', 'extensions', 'pg_temp'
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

REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_audit_policy() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_audit_policy() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_write_audit_log(text, text, text, uuid, text[], text) TO service_role;

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
  'HEALTH-TRIAGE-FIX-001',
  'System Health Triage',
  1,
  'Health triage errors are remediated without creating new telemetry failures',
  'Feature: System Health Triage Error Remediation

Scenario: Client error reporting writes audit and triage records safely
  Given a signed-in member experiences a reportable client warning
  When the client error reporter writes an audit entry
  Then [UI] the member remains on the same screen without an added prompt, crash, or blocked action
  And [DB] audit_log stores one redacted row owned by that member and agent_fix_queue receives a deduplicated actionable row when severity is warn or error
  And [Code] write_audit_log executes through a security-definer boundary while still rejecting anonymous users and attempts to write for another user

Scenario: Airtable sync tolerates the historical table-name typo
  Given AIRTABLE_TABLE_NAME contains the historical value General Appications
  When sync-airtable prepares the Airtable upsert URL
  Then [UI] application submission continues to return a non-blocking success path to the member
  And [DB] the local application record remains the source of truth even if Airtable rejects a request
  And [Code] sync-airtable normalizes the table name to General Applications before sending the external API request

Scenario: Optional support widget configuration does not reopen stale triage tickets
  Given support chat is not fully configured or cannot be reached
  When a signed-in member loads the app shell
  Then [UI] the app shell, navigation, and footer still render without a visible support-chat error
  And [DB] agent_fix_queue does not reopen dismissed SupportWidget.token rows for optional configuration misses
  And [Code] SupportWidget suppresses expected optional-chat setup failures while still reporting unexpected initialization failures',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  NULL,
  'Covers the May 2026 health-system triage remediation pass.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
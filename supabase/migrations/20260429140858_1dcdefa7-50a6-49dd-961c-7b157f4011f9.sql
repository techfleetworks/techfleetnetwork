-- OWASP A01/A05 hardening: operational system-health controls require admin authorization.

CREATE OR REPLACE FUNCTION public.evaluate_system_health()
RETURNS public.system_health_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  recent_errors bigint;
  fanout_backlog bigint;
  outbox_backlog bigint;
  next_status text := 'healthy';
  next_reason text := 'All systems nominal';
  next_pause boolean := false;
  result public.system_health_state;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT count(*) INTO recent_errors
    FROM public.audit_log
   WHERE error_message IS NOT NULL
     AND created_at >= now() - interval '5 minutes';

  SELECT count(*) INTO fanout_backlog
    FROM public.notification_fanout_jobs
   WHERE status IN ('pending','running')
     AND created_at < now() - interval '10 minutes';

  SELECT count(*) INTO outbox_backlog
    FROM public.notification_outbox
   WHERE delivered_at IS NULL
     AND attempts >= 3;

  IF recent_errors > 100 OR fanout_backlog > 50 OR outbox_backlog > 200 THEN
    next_status := 'overloaded';
    next_pause := true;
    next_reason := format(
      'Overloaded: %s errors/5min, %s stuck fanout jobs, %s stuck outbox rows',
      recent_errors, fanout_backlog, outbox_backlog
    );
  ELSIF recent_errors > 25 OR fanout_backlog > 10 OR outbox_backlog > 50 THEN
    next_status := 'degraded';
    next_reason := format(
      'Degraded: %s errors/5min, %s slow fanout, %s slow outbox',
      recent_errors, fanout_backlog, outbox_backlog
    );
  END IF;

  UPDATE public.system_health_state
     SET status = next_status,
         reason = next_reason,
         pause_non_critical = next_pause,
         updated_at = now()
   WHERE id = 1
   RETURNING * INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_auto_remediations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rule public.system_remediations%ROWTYPE;
  matched_count bigint;
  ran integer := 0;
  results jsonb := '[]'::jsonb;
  fn_status text;
  fn_error text;
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  FOR rule IN
    SELECT * FROM public.system_remediations
     WHERE enabled = true
       AND (last_run_at IS NULL OR last_run_at < now() - make_interval(secs => LEAST(GREATEST(cooldown_seconds, 60), 86400)))
  LOOP
    IF NOT public.is_remediation_allowed(rule.remediation_function) THEN
      UPDATE public.system_remediations
         SET last_status = 'blocked',
             last_error = 'function not in allowlist',
             updated_at = now()
       WHERE id = rule.id;
      CONTINUE;
    END IF;

    EXECUTE
      'SELECT count(*) FROM public.audit_log
        WHERE error_message IS NOT NULL
          AND created_at >= now() - interval ''15 minutes''
          AND ($1 IS NULL OR event_type = $1)
          AND error_message ~ $2'
    INTO matched_count
    USING rule.event_type_filter, left(rule.signature_pattern, 500);

    IF matched_count = 0 THEN
      CONTINUE;
    END IF;

    fn_status := 'success';
    fn_error := NULL;
    BEGIN
      EXECUTE format('SELECT public.%I()', rule.remediation_function);
    EXCEPTION WHEN OTHERS THEN
      fn_status := 'error';
      fn_error := left(public.redact_sensitive_text(SQLERRM), 1000);
    END;

    UPDATE public.system_remediations
       SET last_run_at = now(),
           last_status = fn_status,
           last_error = fn_error,
           run_count = run_count + 1,
           success_count = success_count + CASE WHEN fn_status = 'success' THEN 1 ELSE 0 END,
           updated_at = now()
     WHERE id = rule.id;

    INSERT INTO public.audit_log (event_type, table_name, record_id, user_id, error_message, changed_fields)
    VALUES (
      'auto_remediation_run',
      'system_remediations',
      rule.id::text,
      auth.uid(),
      CASE WHEN fn_status = 'error' THEN fn_error ELSE NULL END,
      ARRAY[
        'function:' || rule.remediation_function,
        'status:' || fn_status,
        'matched:' || matched_count::text
      ]
    );

    ran := ran + 1;
    results := results || jsonb_build_object(
      'rule_id', rule.id,
      'function', rule.remediation_function,
      'status', fn_status,
      'matched', matched_count,
      'error', fn_error
    );
  END LOOP;

  RETURN jsonb_build_object('ran', ran, 'results', results);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.evaluate_system_health() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.run_auto_remediations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluate_system_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_auto_remediations() TO authenticated, service_role;

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
  'SEC-OPS-ADMIN-AUTHZ-008',
  'Security hardening',
  90,
  'Operational health and remediation controls require admin authorization',
  'Feature: Operational security controls\n  Scenario: A non-admin attempts to run system health or remediation controls\n    Given system health evaluation and auto-remediation can affect platform behavior\n    When a signed-in non-admin invokes those controls directly\n    Then the database rejects the request\n    And administrators and backend jobs can still evaluate health and run allowlisted remediations',
  'implemented',
  'manual',
  'supabase/migrations/current_operational_controls_admin_authz.sql',
  'OWASP A01/A05 guard for administrative operational controls and secure configuration.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
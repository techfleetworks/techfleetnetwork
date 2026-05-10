REVOKE ALL ON FUNCTION public.redact_sensitive_text(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redact_sensitive_text(text) TO authenticated, service_role;

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
  'HEALTH-TRIAGE-FIX-002',
  'System Health Triage',
  1,
  'Audit redaction helper remains available to authenticated audit logging',
  'Feature: System Health Triage Error Remediation

Scenario: Audit logging redacts client error messages without permission failures
  Given a signed-in member triggers client-side error reporting
  When write_audit_log stores the error message
  Then [UI] the member sees no telemetry-related interruption or added prompt
  And [DB] audit_log stores the redacted message without raising a redact_sensitive_text permission error
  And [Code] anonymous callers cannot execute redact_sensitive_text while authenticated audit logging and service operations can execute it',
  'implemented'::public.bdd_status,
  'manual'::public.bdd_test_type,
  NULL,
  'Added after verification caught remaining redact_sensitive_text permission errors.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  notes = EXCLUDED.notes,
  updated_at = now();
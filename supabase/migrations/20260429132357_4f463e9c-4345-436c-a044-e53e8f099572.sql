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
  'SEC-AUTH-AUDIT-009',
  'Security hardening',
  90,
  'Login failure telemetry does not expose edge transport errors',
  'Feature: Safe authentication audit telemetry\n  Scenario: Failed password login is logged without surfacing backend transport details\n    Given a password login fails through the secure CAPTCHA login boundary\n    When the frontend records the login_failed audit event for auth.users\n    Then the audit row uses a generic authentication failure message\n    And the raw Edge Function transport error is not stored\n    And the attempted email is represented only by a hash unless explicitly allowed',
  'implemented',
  'unit',
  'src/test/lib/account-activity.test.ts',
  'OWASP A01/A09 hardening for auth audit logs and System Health noise reduction.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
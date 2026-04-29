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
  'SEC-ADMIN-GLOBAL-SIGNOUT-015',
  'Security hardening',
  90,
  'Emergency global sign-out requires admin step-up and sanitized failure reporting',
  'Feature: Secure emergency global sign-out\n  Scenario: Verified administrator revokes all active sessions\n    Given an authenticated administrator has completed fresh 2FA verification\n    When they trigger emergency global sign-out\n    Then the backend must verify the admin role server-side\n    And the backend must require fresh 2FA before listing users\n    And only valid auth user identifiers are inserted into revocation records\n    And provider sign-out failures must be classified without exposing emails, tokens, or raw provider messages\n    And the audit record must include counts and sanitized failure codes only',
  'implemented',
  'unit',
  'supabase/functions/admin-sign-out-all-users/validation_test.ts',
  'OWASP A01/A05/A07/A09 hardening for emergency global session revocation.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
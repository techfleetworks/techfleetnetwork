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
  'SEC-TURNSTILE-VERIFY-016',
  'Security hardening',
  90,
  'Public Turnstile verification validates tokens and redacts provider telemetry',
  'Feature: Secure public human verification\n  Scenario: Pre-auth verification accepts only valid Turnstile payloads\n    Given an unauthenticated visitor submits a human verification challenge\n    When the backend receives the verification request\n    Then the request body must be valid JSON within the allowed size\n    And the token must match the expected safe token shape and length\n    And the action must be one of the approved auth actions\n    And provider success must match the requested action when returned\n    And provider errors must be logged with sanitized error codes only\n    And secrets and raw tokens must never be logged or returned',
  'implemented',
  'unit',
  'supabase/functions/verify-turnstile/validation_test.ts',
  'OWASP A03/A05/A07/A09 hardening for the public Turnstile verification endpoint.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
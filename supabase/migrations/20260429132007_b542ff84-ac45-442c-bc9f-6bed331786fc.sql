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
  'SEC-RATE-LIMIT-008',
  'Security hardening',
  90,
  'Auth rate-limit endpoint validates payloads and avoids sensitive disclosure',
  'Feature: Secure authentication throttling\n  Scenario: Public auth rate-limit checks reject malformed payloads safely\n    Given the authentication forms call the public rate-limit boundary before sign-in\n    When a request includes malformed JSON, unsupported actions, oversized identifiers, or injection characters\n    Then the request is rejected with a generic validation error\n    And no raw identifier details are logged or returned\n    And valid login, signup, and password reset checks continue to return throttling status',
  'implemented',
  'unit',
  'supabase/functions/rate-limit/validation_test.ts',
  'OWASP A03/A05/A09 hardening for the legacy public auth throttling edge function.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
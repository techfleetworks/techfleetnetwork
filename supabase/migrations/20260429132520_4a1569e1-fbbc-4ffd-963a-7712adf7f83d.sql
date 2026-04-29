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
  'SEC-CLIENT-TELEMETRY-010',
  'Security hardening',
  90,
  'Client rate-limit telemetry sanitizes malformed events',
  'Feature: Secure client rate-limit telemetry\n  Scenario: Malformed client telemetry cannot leak sensitive request details\n    Given the browser reports a client-side auth or request throttle event\n    When the telemetry payload includes unsupported methods, unsafe paths, oversized retry windows, or injection characters\n    Then the backend records only sanitized enum values and bounded numbers\n    And unsafe request paths are redacted\n    And all success and error responses include consistent CORS and no-store headers',
  'implemented',
  'unit',
  'supabase/functions/client-rate-limit-log/validation_test.ts',
  'OWASP A03/A05/A09 hardening for public client telemetry ingestion.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
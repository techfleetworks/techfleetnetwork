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
  'SEC-CACHE-DLP-005',
  'Security',
  86,
  'Exploration cache writes redact sensitive output before storage',
  'Feature: Secure exploration cache writes\n  Scenario: Cached AI output is validated and scrubbed\n    Given a signed-in user writes an exploration response to the shared cache\n    When the response includes tokens, emails, internal IDs, or oversized content\n    Then unsupported or oversized input is rejected\n    And sensitive values are redacted before storage\n    And cache write failures are logged without exposing private data',
  'implemented',
  'unit',
  'supabase/functions/write-exploration-cache/validation_test.ts',
  'OWASP A01/A03/A05/A09 hardening for cache poisoning, sensitive data exposure, validation, and safe logging.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
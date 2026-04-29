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
  'SEC-FIRECRAWL-SEARCH-014',
  'Security hardening',
  90,
  'External search validates authenticated requests and sanitizes provider output',
  'Feature: Secure external search\n  Scenario: Signed-in user searches through a hardened provider proxy\n    Given a signed-in user submits an external search request\n    When the backend receives the request\n    Then the user token must be validated before provider access\n    And the request body must be valid JSON within the allowed size\n    And the query must meet minimum length and maximum length rules\n    And the result limit must be clamped to the safe range\n    And provider errors must be returned without leaking connector secrets\n    And provider results must expose only normalized title, description, and safe HTTP URLs',
  'implemented',
  'unit',
  'supabase/functions/firecrawl-search/validation_test.ts',
  'OWASP A01/A03/A05/A09/A10 hardening for external search provider proxy.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
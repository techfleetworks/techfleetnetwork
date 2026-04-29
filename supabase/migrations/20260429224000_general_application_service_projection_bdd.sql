INSERT INTO public.bdd_scenarios (
  scenario_id,
  feature_area_number,
  feature_area,
  title,
  gherkin,
  status,
  test_type,
  test_file,
  notes
)
VALUES (
  'SEC-GENERAL-APPLICATION-SERVICE-PROJECTION-054',
  54,
  'OWASP A02 General Application Service Projection',
  'General application service queries use explicit field allowlists',
  'Feature: OWASP A02 general application data minimization

  Scenario: General application service avoids broad projections
    Given a member lists, opens, creates, or reuses a general application
    When the general application service queries application records
    Then every returned payload uses an explicit application field allowlist
    And no query uses wildcard or implicit selection

  Scenario: Profile lookup is purpose-limited
    Given a member creates a general application draft
    When the service reads profile data for the draft email
    Then only the email field is requested
    And unrelated private profile, billing, and membership identifiers are not over-fetched',
  'implemented',
  'unit',
  'src/test/services/general-application.service.security.test.ts',
  'Covers OWASP A02 data minimization for general application list/fetch/create/latest-completed flows and profile email lookup.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area_number = EXCLUDED.feature_area_number,
  feature_area = EXCLUDED.feature_area,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();

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
  'SEC-PROJECT-APPLICATION-PROJECTION-048',
  48,
  'OWASP A02 Project Application Flow Data Projection',
  'Member project application flow queries use explicit field allowlists',
  'Feature: OWASP A02 project application flow data minimization

  Scenario: Member project application flow avoids wildcard projections
    Given a member opens a project application form
    When the page queries project, client, profile, general application, and existing project application data
    Then each query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Project application review payloads are intentionally bounded
    Given the member reviews and submits a project application
    When application flow data is loaded
    Then only rendered form and notification fields are requested
    And unrelated administrative, billing, network, and private metadata is not over-fetched',
  'implemented',
  'unit',
  'src/test/ui/ProjectApplicationPage.security.test.tsx',
  'Covers OWASP A02 data minimization for the member project application creation flow.'
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

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
  'SEC-SUBMITTED-APPLICATIONS-PROJECTION-047',
  47,
  'OWASP A02 Submitted Applications Data Projection',
  'Admin submitted applications grid queries use explicit field allowlists',
  'Feature: OWASP A02 submitted applications data minimization

  Scenario: Admin submitted applications grid avoids wildcard projections
    Given an admin opens the submitted applications review tab
    When the tab queries project applications, general applications, projects, and clients
    Then each query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Submitted application review payloads are intentionally bounded
    Given the admin grid renders review and export fields
    When applicant, project, and client data is loaded
    Then only UI-required review fields are requested
    And unrelated administrative, billing, and secret metadata is not over-fetched',
  'built',
  'unit',
  'src/test/ui/SubmittedApplicationsTab.security.test.tsx',
  'Covers OWASP A02 data minimization for the admin submitted applications review grid.'
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

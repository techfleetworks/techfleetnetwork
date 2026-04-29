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
  'SEC-ROSTER-APPLICANT-PROJECTION-040',
  40,
  'OWASP A02 Roster Applicant Data Projection',
  'Admin applicant detail queries use explicit field allowlists',
  'Feature: OWASP A02 roster applicant data minimization

  Scenario: Admin applicant detail avoids wildcard projections
    Given an admin opens a roster applicant detail page
    When the page queries project application data
    Then project application fields are selected through an explicit allowlist
    And project fields are selected through an explicit allowlist
    And profile fields are selected through an explicit allowlist
    And general application fields are selected through an explicit allowlist
    And no query uses wildcard selection

  Scenario: Applicant PII is intentionally bounded
    Given the applicant detail page needs contact and Discord review fields
    When profile data is loaded
    Then only UI-required profile fields are requested
    And unrelated profile columns are not over-fetched',
  'built',
  'unit',
  'src/test/ui/RosterApplicantDetailPage.security.test.tsx',
  'Covers OWASP A02 data minimization and improves query payload scalability for admin applicant review.'
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

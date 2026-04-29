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
  'SEC-APPLICATION-SUBMISSION-PROJECTION-041',
  41,
  'OWASP A02 Application Submission Data Projection',
  'Admin application submission detail queries use explicit field allowlists',
  'Feature: OWASP A02 application submission data minimization

  Scenario: Admin application submission detail avoids wildcard projections
    Given an admin opens an application submission detail page
    When the page queries project application, project, client, profile, and general application data
    Then each query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Applicant profile data is intentionally bounded
    Given the submission detail page renders applicant profile fields
    When profile data is loaded
    Then only UI-required applicant fields are requested
    And unrelated PII columns are not over-fetched',
  'built',
  'unit',
  'src/test/ui/ApplicationSubmissionDetailPage.security.test.tsx',
  'Covers OWASP A02 data minimization and reduces admin application review payload size.'
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

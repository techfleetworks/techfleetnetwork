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
  'SEC-PROJECT-ANALYSIS-PROJECTION-050',
  50,
  'OWASP A02 Project Analysis Data Projection',
  'Admin project analysis queries use explicit field allowlists',
  'Feature: OWASP A02 project analysis data minimization

  Scenario: Admin project analysis avoids wildcard projections
    Given an admin opens project readiness analysis
    When the analysis queries project, application, cross-project, and profile data
    Then each query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Analysis payloads are intentionally bounded
    Given the analysis only needs staffing, cross-application, and applicant identity signals
    When completed application data is loaded
    Then long-form application answers are not requested
    And unrelated administrative, billing, and private metadata is not over-fetched',
  'implemented',
  'unit',
  'src/test/ui/ProjectAnalysisContent.security.test.tsx',
  'Covers OWASP A02 data minimization for admin project readiness analysis.'
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

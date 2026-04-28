GRANT EXECUTE ON FUNCTION public.get_network_stats() TO anon, authenticated, service_role;

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
  'NET-ACT-PUBLIC-STATS-ACCESS-001',
  'Network Activity',
  96,
  'Public Network Activity loads aggregate stats instead of zero fallback values',
  'Feature: Network Activity
  Scenario: Public visitor views aggregate community stats
    Given I am viewing the public landing page
    When Network Activity requests aggregate stats
    Then the backend permits access to the aggregate stats function
    And the UI does not replace a failed stats request with all zero values
    And the user sees either real stats or a clear loading/error state',
  'implemented',
  'unit',
  'src/test/ui/NetworkActivity.test.tsx',
  'Regression coverage for the bug where revoked public access plus a zero fallback made Network Activity show all 0.'
) ON CONFLICT (scenario_id) DO UPDATE SET
  feature_area = EXCLUDED.feature_area,
  feature_area_number = EXCLUDED.feature_area_number,
  title = EXCLUDED.title,
  gherkin = EXCLUDED.gherkin,
  status = EXCLUDED.status,
  test_type = EXCLUDED.test_type,
  test_file = EXCLUDED.test_file,
  notes = EXCLUDED.notes,
  updated_at = now();
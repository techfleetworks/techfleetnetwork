GRANT EXECUTE ON FUNCTION public.get_network_stats() TO anon;

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
  'NET-ACT-PUBLIC-012',
  'Network Activity',
  96,
  'Public homepage can load aggregate Network Activity stats',
  'Feature: Public Network Activity aggregates
  Scenario: Homepage visitors can load aggregate stats without signing in
    Given an unauthenticated visitor opens the homepage
    When the Network Activity widget requests aggregate community stats
    Then the aggregate stats request succeeds
    And the widget displays only non-sensitive counts
    And no individual user data is exposed',
  'implemented',
  'unit',
  'src/test/ui/NetworkActivity.test.tsx',
  'Restores anonymous execute access for the aggregate-only homepage stats function.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();
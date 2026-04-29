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
  'SEC-CLIENTS-PROJECTS-TABS-PROJECTION-049',
  49,
  'OWASP A02 Admin Clients and Projects Data Projection',
  'Admin clients and projects tabs query explicit field allowlists',
  'Feature: OWASP A02 admin clients and projects data minimization

  Scenario: Admin clients and projects tabs avoid wildcard projections
    Given an admin opens client and project management tabs
    When the tabs query clients and projects
    Then each query uses an explicit field allowlist
    And no query uses wildcard selection

  Scenario: Admin management payloads are intentionally bounded
    Given the client and project tabs render management cards and tables
    When client and project data is loaded
    Then only UI-required management fields are requested
    And unrelated billing, private, and secret metadata is not over-fetched',
  'implemented',
  'unit',
  'src/test/ui/ClientsProjectsTabs.security.test.tsx',
  'Covers OWASP A02 data minimization for admin client and project management tabs.'
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

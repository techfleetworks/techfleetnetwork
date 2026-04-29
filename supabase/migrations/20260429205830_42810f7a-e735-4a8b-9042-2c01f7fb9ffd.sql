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
  'SEC-SYSTEM-HEALTH-ERROR-DATA-MIN-042',
  42,
  'OWASP A02/A09 System Health Data Minimization',
  'System health admin diagnostics use explicit projections and redacted user-facing errors',
  'Feature: OWASP A02 and A09 system health diagnostics hardening

  Scenario: Remediation rules load only required fields
    Given an administrator opens system health diagnostics
    When remediation rules are loaded
    Then the service requests an explicit field allowlist
    And the query does not use wildcard selection

  Scenario: Health dashboard avoids raw operational error disclosure
    Given an administrator views email pipeline failures
    When provider or database errors are displayed
    Then recipient identifiers are masked
    And raw internal error text is replaced with safe operational guidance
    And retry failures show a generic dashboard message',
  'implemented',
  'unit',
  'src/test/ui/SystemHealthPage.security.test.tsx',
  'Covers OWASP A02 data minimization and OWASP A09 sensitive error disclosure on admin diagnostics surfaces.'
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
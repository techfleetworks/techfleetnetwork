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
VALUES
(
  'SEC-ACTIVITY-LOG-HARDENING-034',
  34,
  'OWASP A02/A09 Admin Activity Log Hardening',
  'Admin activity log failures are logged safely and shown generically',
  'Feature: OWASP A02/A09 admin activity log hardening

  Scenario: Activity log load failures use centralized redacted logging
    Given an admin opens the activity log
    When the audit log query fails
    Then the browser console does not receive a raw console.error payload
    And the failure is logged through the centralized redacting logger
    And sensitive backend details are not shown in the page alert

  Scenario: Profile enrichment failures do not block the audit log
    Given profile enrichment fails while the activity log loads
    When the audit log records are available
    Then the page continues loading available activity records
    And the enrichment failure is logged as non-critical with redaction',
  'built',
  'unit',
  'src/test/ui/ActivityLogPage.security.test.tsx',
  'Covers OWASP A02 sensitive data exposure and A09 logging consistency for the admin audit trail UI.'
),
(
  'PERF-ACTIVITY-LOG-PROJECTION-035',
  35,
  'Activity Log Query Projection Performance',
  'Activity log queries use bounded pagination and explicit field projection',
  'Feature: Activity log scalable query projection

  Scenario: Admin activity log loads only fields needed by the grid
    Given the audit log contains operational records
    When the admin activity log page queries records
    Then it requests an explicit allowlist of grid fields
    And it does not use wildcard column selection
    And it keeps pagination bounded to the configured page size',
  'built',
  'unit',
  'src/test/ui/ActivityLogPage.security.test.tsx',
  'Prevents over-fetching as audit_log grows and keeps admin exports aligned to intentional fields.'
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

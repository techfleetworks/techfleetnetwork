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
  'SEC-ANNOUNCEMENT-EMAIL-012',
  'Security hardening',
  90,
  'Announcement email sending validates admin access and request payloads',
  'Feature: Secure announcement email sending\n  Scenario: Admin-only announcement email send validates inputs and avoids recipient disclosure\n    Given an administrator sends an announcement email\n    When the backend receives the request\n    Then the caller must be verified as an admin\n    And the announcement identifier must be a valid UUID\n    And malformed payloads are rejected before any recipient lookup\n    And queue or provider errors are logged without exposing recipient email addresses',
  'implemented',
  'unit',
  'supabase/functions/send-announcement-email/validation_test.ts',
  'OWASP A01/A03/A05/A09 hardening for announcement email dispatch.'
)
ON CONFLICT (scenario_id) DO UPDATE SET
  title = excluded.title,
  gherkin = excluded.gherkin,
  status = excluded.status,
  test_type = excluded.test_type,
  test_file = excluded.test_file,
  notes = excluded.notes,
  updated_at = now();